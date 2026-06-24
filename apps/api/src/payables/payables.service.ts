import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StorageProvider } from '@pos-tercos/domain';
import type { CreatePayable, PayPayable, PayableCommitment, PayableStatus } from '@pos-tercos/types';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import { PrismaService } from '../prisma/prisma.service';

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
        createdById: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_CREATED',
      entityType: 'payable_commitment',
      entityId: row.id,
      metadata: { beneficiary: row.beneficiary, amount: Number(row.amount) },
    });
    return this.toDto(row);
  }

  async pay(
    id: string,
    input: PayPayable,
    proof: { buffer: Buffer; mime: string; ext: string } | null,
    actorId: string,
  ): Promise<PayableCommitment> {
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Compromiso no encontrado.');
    if (row.status !== 'PENDING') throw new BadRequestException('El compromiso ya no está pendiente.');

    const amount = Number(row.amount);
    const cash = round2(input.cashAmount);
    const bank = round2(input.bankAmount);
    if (cash < 0 || bank < 0) throw new BadRequestException('Los montos no pueden ser negativos.');
    if (Math.abs(cash + bank - amount) > 0.01) {
      throw new BadRequestException(
        `La suma efectivo + cuenta (${cash + bank}) debe ser igual al monto del compromiso (${amount}).`,
      );
    }

    let proofImageKey: string | null = null;
    if (proof) {
      const stored = await this.storage.put(`payables/${id}`, proof.buffer, proof.mime, proof.ext);
      proofImageKey = stored.key;
    }

    const updated = await this.prisma.payableCommitment.update({
      where: { id },
      data: {
        status: 'PAID',
        cashAmount: cash,
        bankAmount: bank,
        proofImageKey,
        paidAt: new Date(),
        actorId,
        note: input.note ?? row.note,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_PAID',
      entityType: 'payable_commitment',
      entityId: id,
      metadata: { beneficiary: row.beneficiary, amount, cashAmount: cash, bankAmount: bank },
    });
    return this.toDto(updated);
  }

  async cancel(id: string, actorId: string): Promise<void> {
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Compromiso no encontrado.');
    if (row.status === 'CANCELLED') return;
    if (row.status === 'PAID') throw new BadRequestException('No se puede cancelar un compromiso ya pagado.');
    await this.prisma.payableCommitment.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({
      userId: actorId,
      action: 'PAYABLE_CANCELLED',
      entityType: 'payable_commitment',
      entityId: id,
      metadata: { beneficiary: row.beneficiary, amount: Number(row.amount) },
    });
  }

  async getProof(id: string): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.prisma.payableCommitment.findUnique({ where: { id } });
    if (!row || !row.proofImageKey) throw new NotFoundException('Comprobante no encontrado.');
    const buffer = await this.storage.get(row.proofImageKey);
    const ext = row.proofImageKey.split('.').pop() ?? '';
    return { buffer, mime: mimeForExtension(ext) };
  }

  private toDto(row: {
    id: string;
    beneficiary: string;
    description: string;
    amount: { toString(): string };
    status: string;
    cashAmount: { toString(): string };
    bankAmount: { toString(): string };
    proofImageKey: string | null;
    paidAt: Date | null;
    note: string | null;
    createdAt: Date;
  }): PayableCommitment {
    return {
      id: row.id,
      beneficiary: row.beneficiary,
      description: row.description,
      amount: Number(row.amount),
      status: row.status as PayableStatus,
      cashAmount: Number(row.cashAmount),
      bankAmount: Number(row.bankAmount),
      hasProof: row.proofImageKey !== null,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
