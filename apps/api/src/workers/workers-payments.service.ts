import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StorageProvider } from '@pos-tercos/domain';
import type { PayrollPayment } from '@pos-tercos/types';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import { resolvePocketSplit } from '../common/pocket-split';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseYmd,
  paymentPeriodOf,
  round2,
  todayUtc,
  toPayment,
  ymd,
} from './payroll-period';
import { WorkersService } from './workers.service';

/**
 * Control de PAGOS de nómina (solo Dueño + PIN): marcar PAGADO con
 * comprobante, desmarcar y servir el binario. Separado de WorkersService —
 * el cálculo de base/períodos vive allá (se inyecta, nunca al revés).
 */
@Injectable()
export class WorkersPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly workers: WorkersService,
  ) {}

  // ==================================================================
  // CONTROL DE PAGOS — marcar PAGADO/CANCELADO + comprobante (solo Dueño)
  // ==================================================================

  async markPaymentPaid(
    userId: string,
    periodStartYmd: string,
    pin: string,
    actorId: string,
    proof: { buffer: Buffer; mime: string; ext: string },
    note: string | undefined,
    cashAmount?: number,
    bankAmount?: number,
  ): Promise<PayrollPayment> {
    this.assertTodayIsWeekendOrThrow();
    const pago = paymentPeriodOf(parseYmd(periodStartYmd));
    if (pago.end.getTime() > todayUtc().getTime()) {
      throw new BadRequestException(
        `Este pago todavía no termina (cierra el ${ymd(pago.end)}). No se puede marcar pagado aún.`,
      );
    }
    const approverId = await this.approvals.verify(pin);
    const user = await this.workers.getEmploymentUser(userId);

    // Defensa: no se puede marcar pagado un período anterior al ingreso o
    // posterior a la salida del empleado (vendrían con base=0 y no hay nada
    // que pagar — sería ruido en la auditoría).
    if (user.hireDate && user.hireDate > pago.end) {
      throw new BadRequestException(
        `El empleado ingresó el ${ymd(user.hireDate)}; no hay nada para pagar en este período (cerró el ${ymd(pago.end)}).`,
      );
    }
    if (user.terminationDate && user.terminationDate < pago.start) {
      throw new BadRequestException(
        `El empleado salió el ${ymd(user.terminationDate)}; no hay nada para pagar en este período.`,
      );
    }

    // Snapshot del total al momento del pago.
    const { base } = await this.workers.computePagoBase(user, pago);
    const adjAgg = await this.prisma.payrollAdjustment.aggregate({
      where: { userId, periodStart: pago.start },
      _sum: { amount: true },
    });
    const amount = round2(base + Number(adjAgg._sum.amount ?? 0));
    if (amount <= 0) {
      throw new BadRequestException(
        'No hay monto a pagar en este período (días trabajados + novedades = 0). Marcarlo como pagado no tiene sentido.',
      );
    }
    const split = resolvePocketSplit(cashAmount, bankAmount, amount);

    // Sube la imagen. Si había una previa, la borra (solo si la key cambió).
    const stored = await this.storage.put(`payroll/${userId}`, proof.buffer, proof.mime, proof.ext);
    const existing = await this.prisma.payrollPayment.findUnique({
      where: { userId_periodStart: { userId, periodStart: pago.start } },
    });
    if (existing?.proofImageKey && existing.proofImageKey !== stored.key) {
      await this.storage.delete(existing.proofImageKey).catch(() => undefined);
    }

    const row = await this.prisma.payrollPayment.upsert({
      where: { userId_periodStart: { userId, periodStart: pago.start } },
      create: {
        userId,
        periodStart: pago.start,
        status: 'PAID',
        amount,
        resolvedAt: new Date(),
        actorId,
        proofImageKey: stored.key,
        note: note ?? null,
        paymentPocket: split.cash > 0 && split.bank === 0 ? 'EFECTIVO' : split.cash === 0 ? 'CUENTA' : 'MIXTO',
        cashAmount: split.cash,
        bankAmount: split.bank,
      },
      update: {
        status: 'PAID',
        amount,
        resolvedAt: new Date(),
        actorId,
        proofImageKey: stored.key,
        note: note ?? null,
        paymentPocket: split.cash > 0 && split.bank === 0 ? 'EFECTIVO' : split.cash === 0 ? 'CUENTA' : 'MIXTO',
        cashAmount: split.cash,
        bankAmount: split.bank,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_PAYMENT_MARKED',
      entityType: 'payroll_payment',
      entityId: row.id,
      metadata: {
        approverId,
        workerId: userId,
        periodStart: ymd(pago.start),
        status: 'PAID',
        amount,
        proofImageKey: stored.key,
      },
    });
    return toPayment(row, (await this.workers.fetchActorNames([actorId])).get(actorId) ?? null);
  }

  async unmarkPayment(
    userId: string,
    periodStartYmd: string,
    pin: string,
    actorId: string,
  ): Promise<void> {
    const approverId = await this.approvals.verify(pin);
    const pago = paymentPeriodOf(parseYmd(periodStartYmd));
    const existing = await this.prisma.payrollPayment.findUnique({
      where: { userId_periodStart: { userId, periodStart: pago.start } },
    });
    if (!existing) return; // idempotente
    if (existing.proofImageKey) {
      await this.storage.delete(existing.proofImageKey).catch(() => undefined);
    }
    await this.prisma.payrollPayment.delete({ where: { id: existing.id } });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_PAYMENT_UNMARKED',
      entityType: 'payroll_payment',
      entityId: existing.id,
      metadata: {
        approverId,
        workerId: userId,
        periodStart: ymd(pago.start),
        prevStatus: existing.status,
      },
    });
  }

  async getPaymentProof(paymentId: string): Promise<{ buffer: Buffer; mime: string }> {
    const payment = await this.prisma.payrollPayment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.proofImageKey) {
      throw new NotFoundException('Comprobante no encontrado.');
    }
    const buffer = await this.storage.get(payment.proofImageKey);
    const ext = payment.proofImageKey.split('.').pop() ?? '';
    return { buffer, mime: mimeForExtension(ext) };
  }

  /** Solo Sat/Sun (TZ del server = America/Bogota en prod). Bypass de DEV vía
   *  `PAYROLL_PAYMENT_BYPASS_WEEKEND=1` (para poder probar entre semana). */
  private assertTodayIsWeekendOrThrow(): void {
    const dow = new Date().getDay();
    if (dow === 0 || dow === 6) return;
    if (process.env.PAYROLL_PAYMENT_BYPASS_WEEKEND === '1') return;
    throw new BadRequestException(
      'El cierre de pago solo está habilitado los sábados y domingos.',
    );
  }
}
