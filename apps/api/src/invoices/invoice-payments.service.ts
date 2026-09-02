import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StorageProvider } from '@pos-tercos/domain';
import type { Invoice, UserRole } from '@pos-tercos/types';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { assertPuedeGestionarPago } from './invoice-rules';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import {
  appendProofs,
  assertCabenProofs,
  proofKeyAt,
  proofKeys,
  removeProofAt,
  toSlots,
  type ProofUpload,
} from '../common/proof-images';
import { ymdLocal } from '../common/local-dates';
import { pocketOf, resolvePocketSplit } from '../common/pocket-split';
import { PrismaService } from '../prisma/prisma.service';
import { includeFull, toInvoiceDto } from './invoices.mappers';

/**
 * Ciclo de pago de una factura confirmada (marcar pagada con comprobante,
 * revertir, leer el comprobante). Extraído de `InvoicesService` para no inflar
 * el dominio de extracción/confirmación (god-object). Requiere PIN de aprobación.
 */
@Injectable()
export class InvoicePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Marca una factura confirmada como PAGADA con comprobante de transferencia. */
  async markPaymentPaid(
    invoiceId: string,
    pin: string,
    actorId: string,
    actorRole: UserRole,
    proofs: ProofUpload[],
    opts: { paidAtYmd?: string; note?: string; cashAmount?: number; bankAmount?: number },
  ): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        total: true,
        paymentStatus: true,
        paymentProofKey: true,
        paymentProofExtraKeys: true,
        uploadedById: true,
      },
    });
    if (!existing) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    // Autoriza ANTES de consumir el PIN: un no-dueño ajeno a la factura no debe
    // ni siquiera gastar la aprobación.
    assertPuedeGestionarPago(actorRole, actorId, existing.uploadedById);
    const approverId = await this.approvals.verify(pin);
    if (existing.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Solo se pueden marcar pagadas las facturas CONFIRMADAS.',
      );
    }
    // Fast-path: si ya está pagada, no re-procesar (evita sobrescribir el
    // reparto por bolsillo → Tesorería subcontaría el efectivo en silencio).
    if (existing.paymentStatus === 'PAID') {
      throw new BadRequestException('La factura ya está marcada como pagada.');
    }
    if (opts.paidAtYmd && opts.paidAtYmd > ymdLocal(new Date())) {
      throw new BadRequestException('La fecha del pago no puede ser futura.');
    }
    const paidAt = opts.paidAtYmd ? new Date(`${opts.paidAtYmd}T12:00:00.000Z`) : new Date();
    const total = existing.total !== null ? Number(existing.total) : 0;
    const split = resolvePocketSplit(opts.cashAmount, opts.bankAmount, total);

    // Sube los comprobantes; los previos (si los había) se borran después.
    const nuevas = await this.subir(invoiceId, proofs);
    const slots = toSlots(nuevas);
    for (const vieja of proofKeys(existing.paymentProofKey, existing.paymentProofExtraKeys)) {
      if (!nuevas.includes(vieja)) {
        await this.storage.delete(vieja).catch(() => undefined);
      }
    }

    // Claim atómico condicionado al estado: si un re-POST concurrente (doble-click
    // / retry de un upload lento / 2do dispositivo) corre a la par, solo uno
    // transiciona a PAID. El WHERE acepta PENDING o null (facturas legacy
    // confirmadas antes del módulo de pago), nunca PAID.
    const claim = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, OR: [{ paymentStatus: 'PENDING' }, { paymentStatus: null }] },
      data: {
        paymentStatus: 'PAID',
        paidAt,
        paymentProofKey: slots.primary,
        paymentProofExtraKeys: slots.extras,
        paymentActorId: actorId,
        paymentNote: opts.note ?? null,
        paymentPocket: pocketOf(split),
        paymentCashAmount: split.cash,
        paymentBankAmount: split.bank,
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException('La factura cambió de estado (se pagó en paralelo). Recarga.');
    }
    const updated = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: includeFull(),
    });

    await this.audit.log({
      userId: actorId,
      action: 'INVOICE_PAYMENT_MARKED',
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: {
        approverId,
        total: existing.total !== null ? Number(existing.total) : null,
        paidAt: paidAt.toISOString(),
        proofImageKey: slots.primary,
        proofsCount: nuevas.length,
      },
    });
    return toInvoiceDto(updated);
  }

  /** Revierte el pago: borra el registro y la imagen, vuelve a PENDING. */
  async unmarkPayment(
    invoiceId: string,
    pin: string,
    actorId: string,
    actorRole: UserRole,
  ): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentProofKey: true,
        paymentProofExtraKeys: true,
        uploadedById: true,
      },
    });
    if (!existing) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    // Autoriza ANTES de consumir el PIN (ver markPaymentPaid).
    assertPuedeGestionarPago(actorRole, actorId, existing.uploadedById);
    const approverId = await this.approvals.verify(pin);
    if (existing.status !== 'CONFIRMED') {
      throw new BadRequestException('Solo aplica a facturas confirmadas.');
    }
    for (const key of proofKeys(existing.paymentProofKey, existing.paymentProofExtraKeys)) {
      await this.storage.delete(key).catch(() => undefined);
    }
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus: 'PENDING',
        paidAt: null,
        paymentProofKey: null,
        paymentProofExtraKeys: [],
        paymentActorId: null,
        paymentNote: null,
        // Limpia el reparto por bolsillo — dejarlo residual confunde un
        // re-marcado posterior (Tesorería filtra por PAID, no lo cuenta).
        paymentPocket: 'CUENTA',
        paymentCashAmount: 0,
        paymentBankAmount: 0,
      },
      include: includeFull(),
    });
    await this.audit.log({
      userId: actorId,
      action: 'INVOICE_PAYMENT_UNMARKED',
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { approverId, prevStatus: existing.paymentStatus },
    });
    return toInvoiceDto(updated);
  }

  /**
   * El Dueño gestiona el pago de cualquier factura; el Admin Operativo solo el
   * de las que él mismo creó (evita que otro usuario toque su compra). La
   * lectura del comprobante NO pasa por acá — cualquier admin puede verlo.
   */
  /** Lee un comprobante de pago al proveedor (índice 0 = el primero). */
  async getPaymentProof(
    invoiceId: string,
    index = 0,
  ): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { paymentProofKey: true, paymentProofExtraKeys: true },
    });
    const key = row
      ? proofKeyAt(row.paymentProofKey, row.paymentProofExtraKeys, index)
      : null;
    if (!key) throw new NotFoundException('Comprobante no encontrado.');
    const buffer = await this.storage.get(key);
    const ext = key.split('.').pop() ?? '';
    return { buffer, mime: mimeForExtension(ext) };
  }

  /** Suma comprobantes a una factura ya pagada (no cambia plata ni estado). */
  async addPaymentProofs(
    invoiceId: string,
    actorId: string,
    actorRole: UserRole,
    proofs: ProofUpload[],
  ): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        paymentStatus: true,
        paymentProofKey: true,
        paymentProofExtraKeys: true,
        uploadedById: true,
      },
    });
    if (!existing) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    assertPuedeGestionarPago(actorRole, actorId, existing.uploadedById);
    if (existing.paymentStatus !== 'PAID') {
      throw new BadRequestException('Solo se agregan comprobantes a una factura ya pagada.');
    }
    assertCabenProofs(existing.paymentProofKey, existing.paymentProofExtraKeys, proofs.length);
    const nuevas = await this.subir(invoiceId, proofs);
    const slots = appendProofs(
      existing.paymentProofKey,
      existing.paymentProofExtraKeys,
      nuevas,
    );
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { paymentProofKey: slots.primary, paymentProofExtraKeys: slots.extras },
      include: includeFull(),
    });
    await this.audit.log({
      userId: actorId,
      action: 'INVOICE_PAYMENT_PROOFS_ADDED',
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { added: nuevas.length, total: slots.extras.length + 1 },
    });
    return toInvoiceDto(updated);
  }

  /** Quita un comprobante. Nunca deja sin soporte una factura pagada. */
  async removePaymentProof(
    invoiceId: string,
    index: number,
    actorId: string,
    actorRole: UserRole,
  ): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        paymentProofKey: true,
        paymentProofExtraKeys: true,
        uploadedById: true,
      },
    });
    if (!existing) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    assertPuedeGestionarPago(actorRole, actorId, existing.uploadedById);
    const { slots, removed } = removeProofAt(
      existing.paymentProofKey,
      existing.paymentProofExtraKeys,
      index,
      { minimo: 1 },
    );
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { paymentProofKey: slots.primary, paymentProofExtraKeys: slots.extras },
      include: includeFull(),
    });
    await this.storage.delete(removed).catch(() => undefined);
    await this.audit.log({
      userId: actorId,
      action: 'INVOICE_PAYMENT_PROOF_REMOVED',
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { index, removedKey: removed },
    });
    return toInvoiceDto(updated);
  }

  private async subir(invoiceId: string, proofs: ProofUpload[]): Promise<string[]> {
    const keys: string[] = [];
    for (const p of proofs) {
      const stored = await this.storage.put(
        `invoice-payments/${invoiceId}`,
        p.buffer,
        p.mime,
        p.ext,
      );
      keys.push(stored.key);
    }
    return keys;
  }
}
