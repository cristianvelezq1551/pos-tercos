import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  nextWeekRef,
  payrollWeekFor,
  prevWeekRef,
  type PayrollWeek,
  type StorageProvider,
} from '@pos-tercos/domain';
import type {
  PayWeekDays,
  PayrollWeekPayment,
  WeeklyPayrollDay,
  WeeklyPayrollEntry,
  WeeklyPayrollReport,
} from '@pos-tercos/types';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftsService } from '../shifts/shifts.service';
import { parseYmd, round2, todayUtc, ymd } from './payroll-period';
import { WorkersService } from './workers.service';

/**
 * Nómina SEMANAL para empleados DIARIO (v6). La "semana" es la corrida de días
 * laborables entre descansos (el negocio cierra los lunes; el descanso se corre
 * al martes si el lunes es festivo, así que un lunes festivo CIERRA la semana y
 * se paga). El dueño paga por días seleccionados con abonos parciales — cada
 * abono pide comprobante y, si tiene parte en efectivo, genera un CashMovement
 * OUT en la caja abierta para que el arqueo cuadre.
 */
@Injectable()
export class WorkersWeeklyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly workers: WorkersService,
    private readonly shifts: ShiftsService,
  ) {}

  /** Reporte de la semana que contiene `weekRefYmd` (cualquier día de la semana). */
  async getWeeklyPayroll(weekRefYmd: string): Promise<WeeklyPayrollReport> {
    const week = payrollWeekFor(parseYmd(weekRefYmd));
    const weekStartDate = parseYmd(week.weekStart);
    const weekEndDate = parseYmd(week.weekEnd);

    const users = await this.prisma.user.findMany({
      where: {
        payType: 'DAILY',
        salaryAmount: { not: null },
        OR: [{ hireDate: null }, { hireDate: { lte: weekEndDate } }],
        AND: [{ OR: [{ terminationDate: null }, { terminationDate: { gte: weekStartDate } }] }],
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        salaryAmount: true,
        hireDate: true,
        terminationDate: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const entries: WeeklyPayrollEntry[] = [];
    for (const u of users) {
      entries.push(await this.buildEntry(u, week));
    }

    return {
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      weekLabel: week.weekLabel,
      prevRef: prevWeekRef(week),
      nextRef: nextWeekRef(week),
      entries,
    };
  }

  private async buildEntry(
    u: {
      id: string;
      fullName: string;
      role: string;
      salaryAmount: { toString(): string } | null;
      hireDate: Date | null;
      terminationDate: Date | null;
    },
    week: PayrollWeek,
  ): Promise<WeeklyPayrollEntry> {
    const valuePerDay = Number(u.salaryAmount ?? 0);
    const weekStartDate = parseYmd(week.weekStart);
    const weekEndDate = parseYmd(week.weekEnd);

    const overrides = await this.prisma.payrollDay.findMany({
      where: { userId: u.id, workDate: { gte: weekStartDate, lte: weekEndDate } },
      select: { workDate: true, amount: true },
    });
    const ovMap = new Map(overrides.map((o) => [ymd(o.workDate), Number(o.amount)]));

    const payments = await this.prisma.payrollWeekPayment.findMany({
      where: { userId: u.id, weekStart: weekStartDate, status: 'PAID' },
      orderBy: { paidAt: 'asc' },
    });
    const paidSet = new Set<string>();
    for (const p of payments) for (const d of p.paidDays as string[]) paidSet.add(d);

    const today = todayUtc();
    const hireYmd = u.hireDate ? ymd(u.hireDate) : null;
    const termYmd = u.terminationDate ? ymd(u.terminationDate) : null;

    const days: WeeklyPayrollDay[] = week.days.map((d) => {
      const employed = (!hireYmd || d.date >= hireYmd) && (!termYmd || d.date <= termYmd);
      const ov = ovMap.get(d.date);
      const hasOverride = ov !== undefined;
      let amount: number;
      if (!employed) amount = 0;
      else if (hasOverride) amount = ov;
      else amount = d.status === 'WORKDAY' ? valuePerDay : 0;
      return {
        date: d.date,
        weekday: d.weekday,
        isHoliday: d.isHoliday,
        status: d.status,
        amount: round2(amount),
        hasOverride,
        isPaid: paidSet.has(d.date),
        isFuture: parseYmd(d.date).getTime() > today.getTime(),
      };
    });

    const owedTotal = round2(days.reduce((a, d) => a + d.amount, 0));
    const paidTotal = round2(
      payments.reduce((a, p) => a + Number(p.amount), 0),
    );
    const actorNames = await this.workers.fetchActorNames(payments.map((p) => p.actorId));

    return {
      userId: u.id,
      fullName: u.fullName,
      role: u.role,
      valuePerDay: round2(valuePerDay),
      days,
      owedTotal,
      paidTotal,
      remaining: round2(owedTotal - paidTotal),
      paidDays: Array.from(paidSet).sort(),
      payments: payments.map((p) => this.toWeekPaymentDto(p, actorNames.get(p.actorId ?? '') ?? null)),
    };
  }

  /** Registra un abono de días seleccionados de la semana (con comprobante). */
  async payWeekDays(
    input: PayWeekDays,
    proof: { buffer: Buffer; mime: string; ext: string },
    pin: string,
    actorId: string,
  ): Promise<PayrollWeekPayment> {
    const approverId = await this.approvals.verify(pin);
    const week = payrollWeekFor(parseYmd(input.weekStart));
    if (week.weekStart !== input.weekStart) {
      throw new BadRequestException(
        'weekStart debe ser el inicio de una semana de nómina válida (YYYY-MM-DD).',
      );
    }
    const user = await this.workers.getEmploymentUser(input.userId);
    if (user.payType !== 'DAILY' || user.salaryAmount === null) {
      throw new BadRequestException('El pago semanal por días es solo para empleados DIARIO.');
    }

    const entry = await this.buildEntry(
      {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        salaryAmount: user.salaryAmount,
        hireDate: user.hireDate,
        terminationDate: user.terminationDate,
      },
      week,
    );
    const byDate = new Map(entry.days.map((d) => [d.date, d]));

    let amount = 0;
    const uniqueDays = Array.from(new Set(input.days));
    for (const day of uniqueDays) {
      const d = byDate.get(day);
      if (!d) throw new BadRequestException(`El día ${day} no pertenece a la semana.`);
      if (d.amount <= 0) throw new BadRequestException(`El día ${day} no tiene monto a pagar (descanso o ausencia).`);
      if (d.isFuture) throw new BadRequestException(`El día ${day} todavía no llega; no se puede pagar a futuro.`);
      if (d.isPaid) throw new BadRequestException(`El día ${day} ya fue pagado en un abono anterior.`);
      amount += d.amount;
    }
    amount = round2(amount);
    if (amount <= 0) throw new BadRequestException('No hay monto a pagar en los días seleccionados.');

    // Reparto por bolsillo: efectivo + cuenta deben sumar el total de los días.
    const cashAmount = round2(input.cashAmount);
    const bankAmount = round2(input.bankAmount);
    if (cashAmount < 0 || bankAmount < 0) {
      throw new BadRequestException('Los montos por bolsillo no pueden ser negativos.');
    }
    if (Math.abs(cashAmount + bankAmount - amount) > 0.01) {
      throw new BadRequestException(
        `La suma efectivo + cuenta (${cashAmount + bankAmount}) debe ser igual al total de los días (${amount}).`,
      );
    }

    // Caja: la porción en efectivo sale del cajón → exige caja abierta.
    let cashMovementId: string | null = null;
    let shiftId: string | null = null;
    if (cashAmount > 0) {
      const shift = await this.shifts.getCurrent(actorId);
      if (!shift) {
        throw new BadRequestException(
          'Para pagar nómina en efectivo debe haber una caja abierta (el egreso sale del cajón).',
        );
      }
      const mv = await this.shifts.addCashMovement(
        shift.id,
        {
          type: 'OUT',
          method: 'CASH',
          amount: cashAmount,
          reason: `Nómina ${user.fullName} · semana ${input.weekStart}`,
        },
        actorId,
      );
      cashMovementId = mv.id;
      shiftId = shift.id;
    }

    const stored = await this.storage.put(`payroll-week/${user.id}`, proof.buffer, proof.mime, proof.ext);

    const row = await this.prisma.payrollWeekPayment.create({
      data: {
        userId: user.id,
        weekStart: parseYmd(week.weekStart),
        paidDays: uniqueDays.sort(),
        amount,
        cashAmount,
        bankAmount,
        status: 'PAID',
        proofImageKey: stored.key,
        actorId,
        cashMovementId,
        shiftId,
        note: input.note ?? null,
        paidAt: new Date(),
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_WEEK_PAID',
      entityType: 'payroll_week_payment',
      entityId: row.id,
      metadata: {
        approverId,
        workerId: user.id,
        weekStart: input.weekStart,
        days: uniqueDays,
        amount,
        cashAmount,
        bankAmount,
        cashMovementId,
      },
    });

    const actorName = (await this.workers.fetchActorNames([actorId])).get(actorId) ?? null;
    return this.toWeekPaymentDto(row, actorName);
  }

  /** Anula un abono (marca VOIDED + reversa el egreso de caja si fue efectivo). */
  async voidWeekPayment(paymentId: string, pin: string, actorId: string): Promise<void> {
    const approverId = await this.approvals.verify(pin);
    const row = await this.prisma.payrollWeekPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw new NotFoundException('Abono no encontrado.');
    if (row.status === 'VOIDED') return; // idempotente

    // Reversa de caja: los movimientos son insert-only, así que compensamos con
    // un IN por la porción en efectivo en la caja abierta (si la hay).
    const cashPortion = Number(row.cashAmount);
    if (row.cashMovementId && cashPortion > 0) {
      const shift = await this.shifts.getCurrent(actorId);
      if (shift) {
        await this.shifts.addCashMovement(
          shift.id,
          {
            type: 'IN',
            method: 'CASH',
            amount: cashPortion,
            reason: `Reversa nómina · abono ${row.id.slice(0, 8)}`,
          },
          actorId,
        );
      }
    }

    await this.prisma.payrollWeekPayment.update({
      where: { id: paymentId },
      data: { status: 'VOIDED' },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_WEEK_PAYMENT_VOIDED',
      entityType: 'payroll_week_payment',
      entityId: paymentId,
      metadata: { approverId, workerId: row.userId, amount: Number(row.amount) },
    });
  }

  async getWeekPaymentProof(paymentId: string): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.prisma.payrollWeekPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw new NotFoundException('Comprobante no encontrado.');
    const buffer = await this.storage.get(row.proofImageKey);
    const ext = row.proofImageKey.split('.').pop() ?? '';
    return { buffer, mime: mimeForExtension(ext) };
  }

  private toWeekPaymentDto(
    row: {
      id: string;
      userId: string;
      weekStart: Date;
      paidDays: unknown;
      amount: { toString(): string };
      cashAmount: { toString(): string };
      bankAmount: { toString(): string };
      status: string;
      proofImageKey: string | null;
      note: string | null;
      paidAt: Date;
    },
    actorName: string | null,
  ): PayrollWeekPayment {
    return {
      id: row.id,
      userId: row.userId,
      weekStart: ymd(row.weekStart),
      paidDays: (row.paidDays as string[]) ?? [],
      amount: Number(row.amount),
      cashAmount: Number(row.cashAmount),
      bankAmount: Number(row.bankAmount),
      status: row.status as 'PAID' | 'VOIDED',
      hasProof: row.proofImageKey !== null,
      note: row.note,
      paidAt: row.paidAt.toISOString(),
      actorName,
    };
  }
}
