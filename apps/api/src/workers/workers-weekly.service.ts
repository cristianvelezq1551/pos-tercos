import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  nextWeekRef,
  payrollWeekFor,
  prevWeekRef,
  type PayrollWeek,
  type StorageProvider,
} from '@pos-tercos/domain';
import type {
  AddWeeklyAdjustment,
  FinancePaidPayroll,
  FinancePendingPayroll,
  PayrollAdjustment,
  PayrollDay,
  PayWeekDays,
  PayrollWeekPayment,
  SetPayrollDay,
  WeeklyPayrollDay,
  WeeklyPayrollEntry,
  WeeklyPayrollReport,
} from '@pos-tercos/types';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import { utcDateOfLocalDay } from '../common/local-dates';
import { isSerializationFailure } from '../common/tx';
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

/** Reintentos ante conflicto Serializable (40001 → P2034) en el pago de semana. */
const MAX_WEEK_PAY_RETRIES = 3;

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
        // Nómina unificada: MENSUALES y DIARIOS se pagan por semana.
        payType: { not: null },
        salaryAmount: { not: null },
        OR: [{ hireDate: null }, { hireDate: { lte: weekEndDate } }],
        AND: [{ OR: [{ terminationDate: null }, { terminationDate: { gte: weekStartDate } }] }],
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        payType: true,
        salaryAmount: true,
        hireDate: true,
        terminationDate: true,
        restDaysOfWeek: true,
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

  // ==================================================================
  // CASH-FLOW HELPERS — usados por FinanceSummaryService (/finanzas).
  // Nómina unificada SEMANAL: el "pendiente" es el restante (neto − abonado)
  // de cada semana YA CERRADA; el "pagado" son los abonos reales (PAID) en el
  // rango. Reemplaza el cálculo quincenal (que no veía los abonos semanales).
  // ==================================================================

  /** Restante por pagar de cada semana cerrada (fin ≤ asOf) con saldo > 0,
   *  MÁS la semana en curso con lo devengado hasta asOf (días ≤ asOf + bonos −
   *  abonos; marcada `inProgress`) — así "Pendiente por pagar" responde
   *  "¿cuánto debo realmente a hoy?" y no solo la deuda de semanas cerradas.
   *  Acotado a `lookbackWeeks` semanas hacia atrás (admin-only, negocio chico). */
  async getPendingPayments(
    asOf: Date = new Date(),
    lookbackWeeks = PENDING_LOOKBACK_WEEKS,
  ): Promise<FinancePendingPayroll[]> {
    // `asOf` llega como instante LOCAL (now o fin de ventana); las semanas
    // viven en fecha-solo (medianoche UTC) → se normaliza al día calendario
    // local antes de comparar (mismo criterio que todayUtc()).
    const asOfDay = utcDateOfLocalDay(asOf);
    const asOfYmd = ymd(asOfDay);
    const out: FinancePendingPayroll[] = [];
    let week = payrollWeekFor(asOfDay);
    for (let i = 0; i < lookbackWeeks; i++) {
      if (parseYmd(week.weekEnd).getTime() <= asOfDay.getTime()) {
        // Semana cerrada: el adeudo es definitivo (neto − abonado).
        const report = await this.getWeeklyPayroll(week.weekStart);
        for (const e of report.entries) {
          if (e.remaining > 0.01) {
            out.push({
              userId: e.userId,
              userName: e.fullName,
              periodStart: week.weekStart,
              periodLabel: week.weekLabel,
              total: e.remaining,
            });
          }
        }
      } else if (parseYmd(week.weekStart).getTime() <= asOfDay.getTime()) {
        // Semana EN CURSO: solo lo devengado hasta asOf (los días futuros de
        // la semana NO son deuda todavía). Los bonos/descuentos ya registrados
        // cuentan completos. Si se abonó por adelantado más de lo devengado,
        // el filtro > 0 la omite. (Si asOf cae en descanso, payrollWeekFor
        // devuelve la semana SIGUIENTE — weekStart > asOf — y no entra acá.)
        const report = await this.getWeeklyPayroll(week.weekStart);
        for (const e of report.entries) {
          const accrued = e.days
            .filter((d) => d.date <= asOfYmd)
            .reduce((a, d) => a + d.amount, 0);
          const remaining = round2(accrued + e.adjustmentsTotal - e.paidTotal);
          if (remaining > 0.01) {
            out.push({
              userId: e.userId,
              userName: e.fullName,
              periodStart: week.weekStart,
              periodLabel: week.weekLabel,
              total: remaining,
              inProgress: true,
              accruedThrough: asOfYmd,
            });
          }
        }
      }
      week = payrollWeekFor(parseYmd(prevWeekRef(week)));
    }
    // Más viejo primero (más urgente).
    out.sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.userName.localeCompare(b.userName));
    return out;
  }

  /** Abonos semanales PAID con paidAt en [from, to]. */
  async getPaidPaymentsInRange(from: Date, to: Date): Promise<FinancePaidPayroll[]> {
    const rows = await this.prisma.payrollWeekPayment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      orderBy: { paidAt: 'desc' },
      include: { user: { select: { fullName: true } } },
    });
    return rows.map((r) => {
      const week = payrollWeekFor(r.weekStart);
      return {
        paymentId: r.id,
        userId: r.userId,
        userName: r.user.fullName,
        periodStart: ymd(r.weekStart),
        periodLabel: week.weekLabel,
        amount: Number(r.amount),
        paidAt: r.paidAt.toISOString(),
        hasProof: r.proofImageKey !== null,
      };
    });
  }

  private async buildEntry(
    u: {
      id: string;
      fullName: string;
      role: string;
      payType: 'MONTHLY' | 'DAILY' | null;
      salaryAmount: { toString(): string } | null;
      hireDate: Date | null;
      terminationDate: Date | null;
      restDaysOfWeek: number[];
    },
    week: PayrollWeek,
  ): Promise<WeeklyPayrollEntry> {
    const salary = Number(u.salaryAmount ?? 0);
    const isMonthly = u.payType === 'MONTHLY';
    const weekStartDate = parseYmd(week.weekStart);
    const weekEndDate = parseYmd(week.weekEnd);
    // Tarifa de display: DIARIO = valor/día; MENSUAL = salario/días del mes
    // del inicio de la semana (cada día se cuenta con su propio mes — exacto).
    const valuePerDay = isMonthly ? salary / daysInMonthOf(week.weekStart) : salary;

    const overrides = await this.prisma.payrollDay.findMany({
      where: { userId: u.id, workDate: { gte: weekStartDate, lte: weekEndDate } },
      select: { workDate: true, amount: true },
    });
    const ovMap = new Map(overrides.map((o) => [ymd(o.workDate), Number(o.amount)]));

    const [payments, adjustmentRows] = await Promise.all([
      this.prisma.payrollWeekPayment.findMany({
        where: { userId: u.id, weekStart: weekStartDate, status: 'PAID' },
        orderBy: { paidAt: 'asc' },
      }),
      this.prisma.payrollAdjustment.findMany({
        where: { userId: u.id, periodStart: weekStartDate },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const paidSet = new Set<string>();
    for (const p of payments) for (const d of p.paidDays as string[]) paidSet.add(d);

    const today = todayUtc();
    const hireYmd = u.hireDate ? ymd(u.hireDate) : null;
    const termYmd = u.terminationDate ? ymd(u.terminationDate) : null;

    const employedOn = (date: string): boolean =>
      (!hireYmd || date >= hireYmd) && (!termYmd || date <= termYmd);
    const isFutureDay = (date: string): boolean => parseYmd(date).getTime() > today.getTime();

    let days: WeeklyPayrollDay[];
    if (isMonthly) {
      // MENSUAL: el sueldo cubre TODOS los días calendario (incl. el descanso).
      // El rango que paga ESTA semana = [día siguiente al fin de la semana
      // anterior … fin de esta semana] → así las semanas TESELAN el calendario
      // sin huecos y la suma del mes = salario exacto (igual que el P&G).
      const prevWeek = payrollWeekFor(parseYmd(prevWeekRef(week)));
      const ownedStart = addDaysYmd(prevWeek.weekEnd, 1);
      const ownedDates = calendarRange(ownedStart, week.weekEnd);
      days = ownedDates.map((date) => {
        const employed = employedOn(date);
        const amount = employed ? salary / daysInMonthOf(date) : 0;
        return {
          date,
          weekday: parseYmd(date).getUTCDay(),
          isHoliday: false,
          status: 'WORKDAY' as const,
          amount: round2(amount),
          hasOverride: false,
          isPaid: paidSet.has(date),
          isFuture: isFutureDay(date),
        };
      });
    } else {
      // DIARIO: el override gana; los días de descanso del TRABAJADOR no se
      // pagan (part-time que no trabaja toda la semana); el resto = valor/día.
      // Excepción: un FESTIVO se paga aunque caiga en un día de descanso del
      // trabajador — el negocio abre en festivos y el trabajador asiste (ej. un
      // trabajador de fin de semana cobra el lunes festivo). Si no asistió, el
      // dueño lo pone en 0 con una excepción de día.
      const restSet = new Set(u.restDaysOfWeek);
      days = week.days.map((d) => {
        const employed = employedOn(d.date);
        const ov = ovMap.get(d.date);
        const hasOverride = ov !== undefined;
        const isWorkerRest = restSet.has(d.weekday) && !d.isHoliday;
        let amount: number;
        if (!employed) amount = 0;
        else if (hasOverride) amount = ov;
        else if (isWorkerRest) amount = 0;
        else amount = d.status === 'WORKDAY' ? salary : 0;
        return {
          date: d.date,
          weekday: d.weekday,
          isHoliday: d.isHoliday,
          status: isWorkerRest && !hasOverride ? 'REST' : d.status,
          amount: round2(amount),
          hasOverride,
          isPaid: paidSet.has(d.date),
          isFuture: isFutureDay(d.date),
        };
      });
    }

    const owedTotal = round2(days.reduce((a, d) => a + d.amount, 0));
    const adjustmentsTotal = round2(adjustmentRows.reduce((a, r) => a + Number(r.amount), 0));
    const netOwed = round2(owedTotal + adjustmentsTotal);
    const paidTotal = round2(payments.reduce((a, p) => a + Number(p.amount), 0));
    const actorNames = await this.workers.fetchActorNames(payments.map((p) => p.actorId));

    return {
      userId: u.id,
      fullName: u.fullName,
      role: u.role,
      payType: u.payType ?? 'DAILY',
      salaryAmount: u.salaryAmount === null ? null : Number(u.salaryAmount),
      hireDate: u.hireDate ? u.hireDate.toISOString() : null,
      terminationDate: u.terminationDate ? u.terminationDate.toISOString() : null,
      restDaysOfWeek: u.restDaysOfWeek,
      valuePerDay: round2(valuePerDay),
      days,
      owedTotal,
      adjustments: adjustmentRows.map((r) => ({
        id: r.id,
        userId: r.userId,
        periodStart: ymd(r.periodStart),
        concept: r.concept,
        amount: Number(r.amount),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
      adjustmentsTotal,
      netOwed,
      paidTotal,
      remaining: round2(netOwed - paidTotal),
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
    if (!user.payType || user.salaryAmount === null) {
      throw new BadRequestException('El empleado no tiene nómina configurada (tipo + salario).');
    }

    const entry = await this.buildEntry(
      {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        payType: user.payType,
        salaryAmount: user.salaryAmount,
        hireDate: user.hireDate,
        terminationDate: user.terminationDate,
        restDaysOfWeek: user.restDaysOfWeek,
      },
      week,
    );
    const byDate = new Map(entry.days.map((d) => [d.date, d]));

    // Días = etiqueta de cobertura del abono. Validamos que existan y no sean
    // futuros; el MONTO real lo dan cashAmount+bankAmount (no tienen que sumar
    // exacto los días — un abono puede incluir bonos/descuentos del neto).
    const uniqueDays = Array.from(new Set(input.days));
    for (const day of uniqueDays) {
      const d = byDate.get(day);
      if (!d) throw new BadRequestException(`El día ${day} no pertenece a la semana.`);
      if (d.isFuture) throw new BadRequestException(`El día ${day} todavía no llega; no se puede cubrir a futuro.`);
    }

    const cashAmount = round2(input.cashAmount);
    const bankAmount = round2(input.bankAmount);
    if (cashAmount < 0 || bankAmount < 0) {
      throw new BadRequestException('Los montos por bolsillo no pueden ser negativos.');
    }
    const amount = round2(cashAmount + bankAmount);
    if (amount <= 0) throw new BadRequestException('El abono no puede ser 0.');
    // No se puede abonar más que el restante neto de la semana (días + ajustes − abonado).
    if (amount > entry.remaining + 0.01) {
      throw new BadRequestException(
        `El abono (${amount}) supera lo que falta de la semana (${entry.remaining}).`,
      );
    }

    // Comprobante: subir ANTES de la tx (sin side-effect de DB; si la tx falla,
    // nada queda commiteado y la key es determinística por usuario → se pisa).
    const stored = await this.storage.put(`payroll-week/${user.id}`, proof.buffer, proof.mime, proof.ext);

    // Si hay efectivo, la caja debe estar abierta (el egreso sale del cajón).
    let openShiftId: string | null = null;
    if (cashAmount > 0) {
      const shift = await this.shifts.getCurrent(actorId);
      if (!shift) {
        throw new BadRequestException(
          'Para pagar nómina en efectivo debe haber una caja abierta (el egreso sale del cajón).',
        );
      }
      openShiftId = shift.id;
    }

    // Tx SERIALIZABLE con retry: recomputa lo ya abonado de la semana DENTRO de
    // la tx (anti doble-abono concurrente — antes el check usaba un `remaining`
    // leído fuera de la tx) y crea el egreso de caja + la fila de pago JUNTOS
    // (atómico: si algo falla NO queda un egreso fantasma del cajón). El
    // reason del egreso queda atado al pago.
    const weekStartDate = parseYmd(week.weekStart);
    const reason = `Nómina ${user.fullName} · semana ${input.weekStart}`;
    let result: { rowId: string; cashMovementId: string | null; shiftId: string | null } | null = null;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_WEEK_PAY_RETRIES; attempt++) {
      try {
        result = await this.prisma.$transaction(
          async (tx) => {
            const paidAgg = await tx.payrollWeekPayment.aggregate({
              where: { userId: user.id, weekStart: weekStartDate, status: { not: 'VOIDED' } },
              _sum: { amount: true },
            });
            const remainingNow = round2(entry.netOwed - round2(Number(paidAgg._sum.amount ?? 0)));
            if (amount > remainingNow + 0.01) {
              throw new BadRequestException(
                `El abono (${amount}) supera lo que falta de la semana (${remainingNow}).`,
              );
            }
            let cashMovementId: string | null = null;
            let shiftId: string | null = null;
            if (cashAmount > 0 && openShiftId) {
              const sh = await tx.shift.findUnique({ where: { id: openShiftId }, select: { status: true } });
              if (!sh || sh.status !== 'OPEN') {
                throw new BadRequestException('La caja se cerró; reabrila para pagar nómina en efectivo.');
              }
              const mv = await tx.cashMovement.create({
                data: { shiftId: openShiftId, type: 'OUT', method: 'CASH', amount: cashAmount, reason, userId: actorId },
              });
              cashMovementId = mv.id;
              shiftId = openShiftId;
            }
            const row = await tx.payrollWeekPayment.create({
              data: {
                userId: user.id,
                weekStart: weekStartDate,
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
            return { rowId: row.id, cashMovementId, shiftId };
          },
          { isolationLevel: 'Serializable', timeout: 10_000 },
        );
        break;
      } catch (e) {
        lastErr = e;
        if (isSerializationFailure(e) && attempt < MAX_WEEK_PAY_RETRIES) continue;
        throw e;
      }
    }
    if (!result) throw lastErr ?? new Error('payWeekDays falló');

    // Audits (best-effort, fuera de la tx).
    if (result.cashMovementId && result.shiftId) {
      await this.audit.log({
        userId: actorId,
        action: 'CASH_MOVEMENT_OUT',
        entityType: 'shift',
        entityId: result.shiftId,
        metadata: { amount: cashAmount, reason, method: 'CASH' },
      });
    }
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_WEEK_PAID',
      entityType: 'payroll_week_payment',
      entityId: result.rowId,
      metadata: {
        approverId,
        workerId: user.id,
        weekStart: input.weekStart,
        days: uniqueDays,
        amount,
        cashAmount,
        bankAmount,
        cashMovementId: result.cashMovementId,
      },
    });

    const created = await this.prisma.payrollWeekPayment.findUniqueOrThrow({ where: { id: result.rowId } });
    const actorName = (await this.workers.fetchActorNames([actorId])).get(actorId) ?? null;
    return this.toWeekPaymentDto(created, actorName);
  }

  /** Anula un abono (marca VOIDED + reversa el egreso de caja si fue efectivo). */
  async voidWeekPayment(paymentId: string, pin: string, actorId: string): Promise<void> {
    const approverId = await this.approvals.verify(pin);
    const row = await this.prisma.payrollWeekPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw new NotFoundException('Abono no encontrado.');
    if (row.status === 'VOIDED') return; // idempotente

    // El abono tuvo porción en efectivo → la reversa devuelve esa plata al cajón.
    // Si NO hay caja abierta, NO se puede reintegrar el efectivo: antes el código
    // marcaba VOIDED igual y la plata nunca volvía al arqueo (faltante permanente).
    // Ahora se exige caja abierta cuando hay efectivo que reintegrar.
    const cashPortion = Number(row.cashAmount);
    const needsCashReversal = Boolean(row.cashMovementId) && cashPortion > 0;
    let openShiftId: string | null = null;
    if (needsCashReversal) {
      const shift = await this.shifts.getCurrent(actorId);
      if (!shift) {
        throw new BadRequestException(
          'Para anular un abono pagado en efectivo debe haber una caja abierta (el reintegro vuelve al cajón).',
        );
      }
      openShiftId = shift.id;
    }

    // Atómico: el claim por status='PAID' previene doble-void; el IN compensatorio
    // y el cambio de estado van en la MISMA tx (o ambos, o ninguno).
    const reason = `Reversa nómina · abono ${row.id.slice(0, 8)}`;
    const didVoid = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.payrollWeekPayment.updateMany({
        where: { id: paymentId, status: 'PAID' },
        data: { status: 'VOIDED' },
      });
      if (claim.count === 0) return false; // ya anulado en paralelo → idempotente
      if (needsCashReversal && openShiftId) {
        const sh = await tx.shift.findUnique({ where: { id: openShiftId }, select: { status: true } });
        if (!sh || sh.status !== 'OPEN') {
          throw new BadRequestException('La caja se cerró; reabrila para anular el abono en efectivo.');
        }
        await tx.cashMovement.create({
          data: { shiftId: openShiftId, type: 'IN', method: 'CASH', amount: cashPortion, reason, userId: actorId },
        });
      }
      return true;
    });
    if (!didVoid) return;

    if (needsCashReversal && openShiftId) {
      await this.audit.log({
        userId: actorId,
        action: 'CASH_MOVEMENT_IN',
        entityType: 'shift',
        entityId: openShiftId,
        metadata: { amount: cashPortion, reason, method: 'CASH' },
      });
    }
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_WEEK_PAYMENT_VOIDED',
      entityType: 'payroll_week_payment',
      entityId: paymentId,
      metadata: { approverId, workerId: row.userId, amount: Number(row.amount) },
    });
  }

  /** Agrega un bono/descuento a la semana de un empleado (ancla al lunes). */
  async addWeeklyAdjustment(input: AddWeeklyAdjustment, actorId: string): Promise<PayrollAdjustment> {
    const week = payrollWeekFor(parseYmd(input.weekStart));
    if (week.weekStart !== input.weekStart) {
      throw new BadRequestException('weekStart debe ser el inicio de una semana válida (YYYY-MM-DD).');
    }
    const user = await this.workers.getEmploymentUser(input.userId);
    if (!user.payType) {
      throw new BadRequestException('El empleado no tiene nómina configurada.');
    }
    const row = await this.prisma.payrollAdjustment.create({
      data: {
        userId: input.userId,
        periodStart: parseYmd(week.weekStart),
        concept: input.concept,
        amount: input.amount,
        note: input.note ?? null,
        createdById: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_ADJUSTMENT_ADDED',
      entityType: 'payroll_adjustment',
      entityId: row.id,
      metadata: { workerId: input.userId, weekStart: week.weekStart, concept: input.concept, amount: input.amount },
    });
    return {
      id: row.id,
      userId: row.userId,
      periodStart: ymd(row.periodStart),
      concept: row.concept,
      amount: Number(row.amount),
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Setea/edita el valor de UN día de un DIARIO (llegada tarde, ausencia $0,
   *  monto distinto). El cálculo semanal aplica el override (gana sobre el
   *  valor/día y sobre el descanso). Solo Dueño + PIN. */
  async setPayrollDay(userId: string, input: SetPayrollDay, pin: string, actorId: string): Promise<PayrollDay> {
    const approverId = await this.approvals.verify(pin);
    const user = await this.workers.getEmploymentUser(userId);
    if (user.payType !== 'DAILY') {
      throw new BadRequestException('Solo los empleados con pago DIARIO tienen días editables.');
    }
    const workDate = parseYmd(input.workDate);
    const row = await this.prisma.payrollDay.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: { userId, workDate, amount: input.amount, note: input.note ?? null, createdById: actorId },
      update: { amount: input.amount, note: input.note ?? null },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_DAY_SET',
      entityType: 'payroll_day',
      entityId: row.id,
      metadata: { approverId, workerId: userId, workDate: input.workDate, amount: input.amount },
    });
    return {
      id: row.id,
      userId: row.userId,
      workDate: ymd(row.workDate),
      amount: Number(row.amount),
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Borra la excepción de un día (vuelve al valor por defecto). Solo Dueño + PIN. */
  async deletePayrollDay(userId: string, workDateYmd: string, pin: string, actorId: string): Promise<void> {
    const approverId = await this.approvals.verify(pin);
    const workDate = parseYmd(workDateYmd);
    await this.prisma.payrollDay.deleteMany({ where: { userId, workDate } });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_DAY_SET',
      entityType: 'payroll_day',
      metadata: { approverId, workerId: userId, workDate: workDateYmd, removed: true },
    });
  }

  /** Elimina un bono/descuento de la semana. */
  async deleteWeeklyAdjustment(adjustmentId: string, actorId: string): Promise<void> {
    const row = await this.prisma.payrollAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!row) throw new NotFoundException('Ajuste no encontrado.');
    await this.prisma.payrollAdjustment.delete({ where: { id: adjustmentId } });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_ADJUSTMENT_ADDED',
      entityType: 'payroll_adjustment',
      entityId: adjustmentId,
      metadata: { removed: true, workerId: row.userId, concept: row.concept, amount: Number(row.amount) },
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

/** Ventana de semanas hacia atrás que el cash-flow considera "pendiente".
 *  Acota el costo (admin-only) sin esconder atrasos recientes (~4 meses). */
const PENDING_LOOKBACK_WEEKS = 16;

/** Cantidad de días del mes calendario al que pertenece la fecha YYYY-MM-DD.
 *  Para prorratear MENSUAL: salario/díasDelMes por día → mes completo = salario. */
function daysInMonthOf(ymdStr: string): number {
  const [y, m] = ymdStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** YYYY-MM-DD desplazada `n` días (UTC). */
function addDaysYmd(ymdStr: string, n: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Lista de fechas YYYY-MM-DD de `start` a `end` inclusive (UTC). */
function calendarRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  let guard = 0;
  while (cur <= endYmd && guard < 60) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
    guard++;
  }
  return out;
}
