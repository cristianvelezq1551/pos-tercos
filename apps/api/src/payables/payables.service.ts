import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { roundMoney, type StorageProvider } from '@pos-tercos/domain';
import type { CreatePayable, PayPayable, PayableCommitment, PayableStatus } from '@pos-tercos/types';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  appendProofs,
  assertCabenProofs,
  proofCount,
  proofKeyAt,
  removeProofAt,
  toSlots,
  type ProofUpload,
} from '../common/proof-images';

/**
 * Compromisos / cuentas por pagar a personas (ad-hoc). Lo que el negocio le
 * debe a alguien fuera de facturas/costos fijos/nómina. Dueño-only. Al pagar se
 * reparte por bolsillo (efectivo/cuenta/mixto) y la Tesorería lo refleja.
 */
@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(status?: PayableStatus): Promise<PayableCommitment[]> {
    const rows = await this.prisma.payableCommitment.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(input: CreatePayable, actorId: string): Promise<PayableCommitment> {
    const row = await this.prisma.payableCommitment.create({
      data: {
        beneficiary: input.beneficiary.trim(),
        description: input.description.trim(),
        amount: input.amount,
        // Default gasto: el caso común es un arreglo o un servicio. Se
        // desmarca solo al devolver un préstamo.
        isExpense: input.isExpense ?? true,
        createdById: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_CREATED',
      entityType: 'payable_commitment',
      entityId: row.id,
      metadata: {
        beneficiary: row.beneficiary,
        amount: Number(row.amount),
        isExpense: row.isExpense,
      },
    });
    return this.toDto(row);
  }

  async pay(
    id: string,
    input: PayPayable,
    proofs: ProofUpload[],
    actorId: string,
    idempotencyKey?: string,
  ): Promise<PayableCommitment> {
    // Idempotencia: un retry de red con la misma key devuelve el pago ya hecho
    // sin re-desembolsar ni re-subir el comprobante.
    const endpoint = `payables/${id}/pay`;
    if (idempotencyKey) {
      const cached = await this.idempotency.findCached<PayableCommitment>(idempotencyKey, endpoint);
      if (cached) return cached.body;
    }
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Compromiso no encontrado.');
    if (row.status !== 'PENDING') throw new BadRequestException('El compromiso ya no está pendiente.');

    const amount = Number(row.amount);
    const cash = roundMoney(input.cashAmount);
    const bank = roundMoney(input.bankAmount);
    if (cash < 0 || bank < 0) throw new BadRequestException('Los montos no pueden ser negativos.');
    if (Math.abs(cash + bank - amount) > 0.01) {
      throw new BadRequestException(
        `La suma efectivo + cuenta (${cash + bank}) debe ser igual al monto del compromiso (${amount}).`,
      );
    }

    const slots = toSlots(await this.subirProofs(id, proofs));

    // Claim atómico condicionado al estado: dos pagos concurrentes (doble-click /
    // retry) NO pueden ambos desembolsar — el status va en el WHERE, solo uno
    // gana. El check de arriba es el fast-path; este updateMany es la garantía.
    const claim = await this.prisma.payableCommitment.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'PAID',
        cashAmount: cash,
        bankAmount: bank,
        proofImageKey: slots.primary,
        proofExtraKeys: slots.extras,
        paidAt: new Date(),
        actorId,
        note: input.note ?? row.note,
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException('El compromiso ya no está pendiente (se pagó o canceló en paralelo).');
    }
    const updated = await this.prisma.payableCommitment.findUniqueOrThrow({ where: { id } });
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_PAID',
      entityType: 'payable_commitment',
      entityId: id,
      metadata: { beneficiary: row.beneficiary, amount, cashAmount: cash, bankAmount: bank },
    });
    const dto = this.toDto(updated);
    if (idempotencyKey) {
      await this.idempotency.cache({ key: idempotencyKey, endpoint, body: dto, statusCode: 201, userId: actorId });
    }
    return dto;
  }

  async cancel(id: string, actorId: string): Promise<void> {
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Compromiso no encontrado.');
    if (row.status === 'CANCELLED') return;
    if (row.status === 'PAID') throw new BadRequestException('No se puede cancelar un compromiso ya pagado.');
    // Guard atómico: si un pago concurrente lo dejó PAID entre el check y acá,
    // count===0 → no lo pisamos con CANCELLED (la plata ya salió).
    const claim = await this.prisma.payableCommitment.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (claim.count === 0) {
      throw new BadRequestException('El compromiso cambió de estado (se pagó en paralelo). Recarga.');
    }
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_CANCELLED',
      entityType: 'payable_commitment',
      entityId: id,
      metadata: { beneficiary: row.beneficiary, amount: Number(row.amount) },
    });
  }

  async getProof(id: string, index = 0): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    const key = row ? proofKeyAt(row.proofImageKey, row.proofExtraKeys, index) : null;
    if (!key) throw new NotFoundException('Comprobante no encontrado.');
    const buffer = await this.storage.get(key);
    const ext = key.split('.').pop() ?? '';
    return { buffer, mime: mimeForExtension(ext) };
  }

  /** Suma comprobantes a un compromiso ya pagado (no mueve plata). */
  async addProofs(
    id: string,
    actorId: string,
    proofs: ProofUpload[],
  ): Promise<PayableCommitment> {
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Compromiso no encontrado.');
    if (row.status !== 'PAID') {
      throw new BadRequestException('Solo se agregan comprobantes a un compromiso pagado.');
    }
    assertCabenProofs(row.proofImageKey, row.proofExtraKeys, proofs.length);
    const nuevas = await this.subirProofs(id, proofs);
    const slots = appendProofs(row.proofImageKey, row.proofExtraKeys, nuevas);
    const updated = await this.prisma.payableCommitment.update({
      where: { id },
      data: { proofImageKey: slots.primary, proofExtraKeys: slots.extras },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_PROOFS_ADDED',
      entityType: 'payable_commitment',
      entityId: id,
      metadata: { added: nuevas.length },
    });
    return this.toDto(updated);
  }

  /** Quita un comprobante. Acá el soporte es opcional: puede quedar en cero. */
  async removeProof(id: string, index: number, actorId: string): Promise<PayableCommitment> {
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Compromiso no encontrado.');
    const { slots, removed } = removeProofAt(row.proofImageKey, row.proofExtraKeys, index, {
      minimo: 0,
    });
    const updated = await this.prisma.payableCommitment.update({
      where: { id },
      data: { proofImageKey: slots.primary, proofExtraKeys: slots.extras },
    });
    await this.storage.delete(removed).catch(() => undefined);
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_PROOF_REMOVED',
      entityType: 'payable_commitment',
      entityId: id,
      metadata: { index, removedKey: removed },
    });
    return this.toDto(updated);
  }

  private async subirProofs(id: string, proofs: ProofUpload[]): Promise<string[]> {
    const keys: string[] = [];
    for (const p of proofs) {
      const stored = await this.storage.put(`payables/${id}`, p.buffer, p.mime, p.ext);
      keys.push(stored.key);
    }
    return keys;
  }

  private toDto(row: {
    id: string;
    beneficiary: string;
    description: string;
    amount: { toString(): string };
    isExpense: boolean;
    status: string;
    cashAmount: { toString(): string };
    bankAmount: { toString(): string };
    proofImageKey: string | null;
    proofExtraKeys: string[];
    paidAt: Date | null;
    note: string | null;
    createdAt: Date;
  }): PayableCommitment {
    return {
      id: row.id,
      beneficiary: row.beneficiary,
      description: row.description,
      amount: Number(row.amount),
      isExpense: row.isExpense,
      status: row.status as PayableStatus,
      cashAmount: Number(row.cashAmount),
      bankAmount: Number(row.bankAmount),
      hasProof: row.proofImageKey !== null,
      proofsCount: proofCount(row.proofImageKey, row.proofExtraKeys),
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
