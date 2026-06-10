import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StorageProvider } from '@pos-tercos/domain';
import type {
  AddPayrollAdjustment,
  EmployeePanel,
  FinancePaidPayroll,
  FinancePendingPayroll,
  PagoEntry,
  PagoReport,
  PanelPago,
  PanelQuincena,
  PayrollAdjustment,
  PayrollDay,
  PayrollPayment,
  SetPayrollDay,
} from '@pos-tercos/types';
import type { PayType, Prisma } from '@prisma/client';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import { PrismaService } from '../prisma/prisma.service';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const DAY_MS = 86_400_000;

/** Fecha-solo YYYY-MM-DD → Date en UTC medianoche (para columnas @db.Date). */
function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysInclusive(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function eachDayUtc(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) out.push(new Date(t));
  return out;
}
function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}
function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}
/** Modelo de pagos por mes: 4 sub-pagos fijos (2 quincenas × 2 partes).
 *  No son semanas Mon–Sun: el mes calendario no encaja en 4 semanas exactas,
 *  así que se fijan boundaries dentro del mes para tener siempre 4 cards y
 *  que la suma de los 4 = salario mensual.
 *    Parte 1 de Q1: días 1–7 (7 días).
 *    Parte 2 de Q1: días 8–15 (8 días).
 *    Parte 1 de Q2: días 16–22 (7 días).
 *    Parte 2 de Q2: días 23–fin (6 a 9 días según el mes). */
interface PaymentPeriod {
  start: Date;
  end: Date;
  /** 1 = primera quincena (1–15), 2 = segunda (16–fin). */
  quincena: 1 | 2;
  /** 1 = primer sub-pago de la quincena, 2 = segundo. */
  pago: 1 | 2;
  /** Días dentro del pago. */
  daysInPago: number;
}

/** Inicios fijos de pago dentro de un mes (UTC midnight). */
function pagoStartsOfMonth(year: number, month0: number): Date[] {
  return [
    new Date(Date.UTC(year, month0, 1)),
    new Date(Date.UTC(year, month0, 8)),
    new Date(Date.UTC(year, month0, 16)),
    new Date(Date.UTC(year, month0, 23)),
  ];
}

function lastDayOfMonth(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0 + 1, 0));
}

function pagoFromStart(startDate: Date): PaymentPeriod {
  const y = startDate.getUTCFullYear();
  const m = startDate.getUTCMonth();
  const day = startDate.getUTCDate();
  const monthLast = lastDayOfMonth(y, m);
  // Mapear día de inicio → quincena/pago/end.
  if (day === 1) {
    return { start: startDate, end: new Date(Date.UTC(y, m, 7)), quincena: 1, pago: 1, daysInPago: 7 };
  }
  if (day === 8) {
    return { start: startDate, end: new Date(Date.UTC(y, m, 15)), quincena: 1, pago: 2, daysInPago: 8 };
  }
  if (day === 16) {
    return { start: startDate, end: new Date(Date.UTC(y, m, 22)), quincena: 2, pago: 1, daysInPago: 7 };
  }
  if (day === 23) {
    const lastDay = monthLast.getUTCDate();
    return {
      start: startDate,
      end: monthLast,
      quincena: 2,
      pago: 2,
      daysInPago: lastDay - 22,
    };
  }
  throw new Error(`Inicio de pago inválido: ${ymd(startDate)} (debe ser día 1, 8, 16 o 23).`);
}

/** Pago que contiene `probe`. */
function paymentPeriodOf(probe: Date): PaymentPeriod {
  const y = probe.getUTCFullYear();
  const m = probe.getUTCMonth();
  const day = probe.getUTCDate();
  let startDay: 1 | 8 | 16 | 23;
  if (day <= 7) startDay = 1;
  else if (day <= 15) startDay = 8;
  else if (day <= 22) startDay = 16;
  else startDay = 23;
  return pagoFromStart(new Date(Date.UTC(y, m, startDay)));
}

function pagoLabel(p: PaymentPeriod): string {
  const sd = p.start.getUTCDate();
  const ed = p.end.getUTCDate();
  const mShort = MONTHS_SHORT[p.start.getUTCMonth()];
  const y = p.start.getUTCFullYear();
  // "Parte 1/2 de la quincena" — evita sugerir "semana" (los bordes no
  // coinciden con lunes–domingo porque el mes calendario no encaja en
  // 4 semanas exactas; usar sub-pagos quincenales fijos siempre da 4 cards
  // y total mensual = salario).
  return `Parte ${p.pago} · ${sd}–${ed} ${mShort} ${y} · Quincena ${p.quincena}`;
}

function quincenaLabel(year: number, month0: number, q: 1 | 2): string {
  const mShort = MONTHS_SHORT[month0];
  if (q === 1) return `Quincena 1 · 1–15 ${mShort} ${year}`;
  const last = lastDayOfMonth(year, month0).getUTCDate();
  return `Quincena 2 · 16–${last} ${mShort} ${year}`;
}

type EmploymentUser = {
  id: string;
  fullName: string;
  role: string;
  payType: PayType | null;
  salaryAmount: Prisma.Decimal | null;
  hireDate: Date | null;
  terminationDate: Date | null;
  restDaysOfWeek: number[];
};

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async listPayrollUsers(): Promise<
    Array<{ id: string; fullName: string; role: string; payType: PayType | null }>
  > {
    return this.prisma.user.findMany({
      where: { payType: { not: null } },
      select: { id: true, fullName: true, role: true, payType: true },
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
  }

  // ==================================================================
  // DÍAS DE PAGO (modalidad diaria)
  // ==================================================================

  async setPayrollDay(userId: string, input: SetPayrollDay, pin: string, actorId: string): Promise<PayrollDay> {
    const user = await this.getEmploymentUser(userId);
    if (user.payType !== 'DAILY') {
      throw new BadRequestException('Solo los empleados con pago DIARIO tienen días editables.');
    }
    const approverId = await this.approvals.verify(pin);
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
    return toDay(row);
  }

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

  // ==================================================================
  // NOVEDADES
  // ==================================================================

  async addAdjustment(userId: string, input: AddPayrollAdjustment, pin: string, actorId: string): Promise<PayrollAdjustment> {
    await this.getEmploymentUser(userId);
    const approverId = await this.approvals.verify(pin);
    // Normaliza al inicio del pago (cualquier día del pago entrante → su inicio).
    const pagoStart = paymentPeriodOf(parseYmd(input.periodStart)).start;
    const row = await this.prisma.payrollAdjustment.create({
      data: {
        userId,
        periodStart: pagoStart,
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
      metadata: { approverId, workerId: userId, periodStart: ymd(pagoStart), concept: input.concept, amount: input.amount },
    });
    return toAdjustment(row);
  }

  async deleteAdjustment(id: string, pin: string, actorId: string): Promise<void> {
    const existing = await this.prisma.payrollAdjustment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Novedad no encontrada');
    const approverId = await this.approvals.verify(pin);
    await this.prisma.payrollAdjustment.delete({ where: { id } });
    await this.audit.log({
      userId: actorId,
      action: 'PAYROLL_ADJUSTMENT_ADDED',
      entityType: 'payroll_adjustment',
      entityId: id,
      metadata: { approverId, workerId: existing.userId, removed: true },
    });
  }

  // ==================================================================
  // CÁLCULO DE BASE (MONTHLY = salario/4 prorrateado por días empleados;
  // DAILY = suma de días no-descanso con overrides)
  // ==================================================================

  /** Base para UN pago concreto. */
  private async computePagoBase(
    user: EmploymentUser,
    pago: PaymentPeriod,
  ): Promise<{ base: number; daysEmployed: number; daysWorked: number }> {
    const hire = user.hireDate ?? pago.start;
    const term = user.terminationDate ?? pago.end;
    const effStart = maxDate(hire, pago.start);
    const effEnd = minDate(term, pago.end);
    if (effStart > effEnd || !user.payType || user.salaryAmount === null) {
      return { base: 0, daysEmployed: 0, daysWorked: 0 };
    }
    const daysEmployed = daysInclusive(effStart, effEnd);
    const salary = Number(user.salaryAmount);

    if (user.payType === 'MONTHLY') {
      // Pago completo (empleado todo el pago) → exactamente salary/4.
      // Pago parcial (hire/term en el medio) → salary/4 × (daysEmpleados / díasDelPago).
      const base = (salary / 4) * (daysEmployed / pago.daysInPago);
      return { base: round2(base), daysEmployed, daysWorked: daysEmployed };
    }

    // DAILY: contamos hasta hoy (no días futuros). Saltamos descansos cíclicos.
    // Override explícito gana siempre (incluso en día de descanso).
    const accrualEnd = minDate(effEnd, todayUtc());
    if (accrualEnd < effStart) {
      return { base: 0, daysEmployed, daysWorked: 0 };
    }
    const overrides = await this.prisma.payrollDay.findMany({
      where: { userId: user.id, workDate: { gte: effStart, lte: effEnd } },
      select: { workDate: true, amount: true },
    });
    const ovMap = new Map(overrides.map((o) => [ymd(o.workDate), Number(o.amount)]));
    const restSet = new Set(user.restDaysOfWeek);
    let base = 0;
    let daysWorked = 0;
    for (const d of eachDayUtc(effStart, accrualEnd)) {
      const ov = ovMap.get(ymd(d));
      if (ov !== undefined) {
        base += ov;
        if (ov > 0) daysWorked += 1;
        continue;
      }
      if (restSet.has(d.getUTCDay())) continue;
      base += salary;
      daysWorked += 1;
    }
    return { base: round2(base), daysEmployed, daysWorked };
  }

  /** Calendario del mes para DAILY (con descansos visibles). */
  private async buildMonthDays(
    user: EmploymentUser,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<EmployeePanel['days']> {
    if (user.payType !== 'DAILY') return [];
    const effStart = maxDate(user.hireDate ?? monthStart, monthStart);
    const effEnd = minDate(user.terminationDate ?? monthEnd, monthEnd);
    if (effStart > effEnd) return [];
    const salary = user.salaryAmount === null ? 0 : Number(user.salaryAmount);
    const today = todayUtc();
    const restSet = new Set(user.restDaysOfWeek);
    const overrides = await this.prisma.payrollDay.findMany({
      where: { userId: user.id, workDate: { gte: effStart, lte: effEnd } },
    });
    const ovMap = new Map(overrides.map((o) => [ymd(o.workDate), o]));
    return eachDayUtc(effStart, effEnd).map((d) => {
      const ov = ovMap.get(ymd(d));
      const isRest = restSet.has(d.getUTCDay());
      const amount = ov ? Number(ov.amount) : isRest ? 0 : salary;
      return {
        workDate: ymd(d),
        amount,
        isDefault: !ov,
        isAbsence: !ov ? false : amount === 0,
        isRest: isRest && !ov,
        isFuture: d.getTime() > today.getTime(),
        note: ov?.note ?? null,
        overrideId: ov?.id ?? null,
      };
    });
  }

  // ==================================================================
  // PAGO ACTUAL / PASADO — lista para pagar a TODOS los empleados
  // ==================================================================

  async getPaymentPeriod(startYmd: string): Promise<PagoReport> {
    const pago = paymentPeriodOf(parseYmd(startYmd));

    const users = await this.prisma.user.findMany({
      where: {
        payType: { not: null },
        hireDate: { lte: pago.end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: pago.start } }],
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

    const userIds = users.map((u) => u.id);
    const adjustments = userIds.length
      ? await this.prisma.payrollAdjustment.findMany({
          where: { periodStart: pago.start, userId: { in: userIds } },
        })
      : [];
    const payments = userIds.length
      ? await this.prisma.payrollPayment.findMany({
          where: { periodStart: pago.start, userId: { in: userIds } },
        })
      : [];
    const adjByUser = new Map<string, number>();
    for (const a of adjustments) {
      adjByUser.set(a.userId, (adjByUser.get(a.userId) ?? 0) + Number(a.amount));
    }
    const paymentByUser = new Map(payments.map((p) => [p.userId, p] as const));
    const actorMap = await this.fetchActorNames(payments.map((p) => p.actorId));

    let totalPay = 0;
    const entries: PagoEntry[] = [];
    for (const u of users) {
      const { base, daysEmployed, daysWorked } = await this.computePagoBase(u, pago);
      const adjustmentsTotal = round2(adjByUser.get(u.id) ?? 0);
      const total = round2(base + adjustmentsTotal);
      const paymentRow = paymentByUser.get(u.id) ?? null;
      totalPay += total;
      entries.push({
        userId: u.id,
        userFullName: u.fullName,
        userRole: u.role,
        payType: u.payType,
        salaryAmount: u.salaryAmount === null ? null : Number(u.salaryAmount),
        hireDate: u.hireDate ? u.hireDate.toISOString() : null,
        terminationDate: u.terminationDate ? u.terminationDate.toISOString() : null,
        daysEmployed,
        daysWorked,
        base,
        adjustmentsTotal,
        total,
        payment: paymentRow ? toPayment(paymentRow, actorMap.get(paymentRow.actorId ?? '') ?? null) : null,
      });
    }

    return {
      periodStart: ymd(pago.start),
      periodEnd: ymd(pago.end),
      periodLabel: pagoLabel(pago),
      quincena: pago.quincena,
      pago: pago.pago,
      entries,
      totalPay: round2(totalPay),
    };
  }

  // ==================================================================
  // PANEL MENSUAL POR EMPLEADO — siempre 2 quincenas × 2 pagos = 4 pagos
  // ==================================================================

  async getEmployeePanel(userId: string, year: number, month1: number): Promise<EmployeePanel> {
    const u = await this.getEmploymentUser(userId);
    const month0 = month1 - 1;
    const monthStart = new Date(Date.UTC(year, month0, 1));
    const monthEnd = lastDayOfMonth(year, month0);
    const starts = pagoStartsOfMonth(year, month0);

    const buildPago = async (startDate: Date): Promise<PanelPago> => {
      const pago = pagoFromStart(startDate);
      const [base, adjRows, paymentRow] = await Promise.all([
        this.computePagoBase(u, pago),
        this.prisma.payrollAdjustment.findMany({
          where: { userId, periodStart: pago.start },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.payrollPayment.findUnique({
          where: { userId_periodStart: { userId, periodStart: pago.start } },
        }),
      ]);
      const adjustments = adjRows.map(toAdjustment);
      const adjustmentsTotal = round2(adjustments.reduce((s, a) => s + a.amount, 0));
      const actorName = paymentRow?.actorId
        ? (await this.fetchActorNames([paymentRow.actorId])).get(paymentRow.actorId) ?? null
        : null;
      return {
        periodStart: ymd(pago.start),
        periodEnd: ymd(pago.end),
        label: pagoLabel(pago),
        pago: pago.pago,
        base: base.base,
        daysEmployed: base.daysEmployed,
        daysWorked: base.daysWorked,
        adjustments,
        adjustmentsTotal,
        total: round2(base.base + adjustmentsTotal),
        payment: paymentRow ? toPayment(paymentRow, actorName) : null,
      };
    };

    const [p1, p2, p3, p4] = await Promise.all(starts.map(buildPago));
    const q1: PanelQuincena = {
      quincena: 1,
      label: quincenaLabel(year, month0, 1),
      pagos: [p1, p2],
      subtotal: round2(p1.total + p2.total),
    };
    const q2: PanelQuincena = {
      quincena: 2,
      label: quincenaLabel(year, month0, 2),
      pagos: [p3, p4],
      subtotal: round2(p3.total + p4.total),
    };

    const days = await this.buildMonthDays(u, monthStart, monthEnd);

    return {
      userId: u.id,
      userFullName: u.fullName,
      userRole: u.role,
      payType: u.payType,
      salaryAmount: u.salaryAmount === null ? null : Number(u.salaryAmount),
      hireDate: u.hireDate ? u.hireDate.toISOString() : null,
      terminationDate: u.terminationDate ? u.terminationDate.toISOString() : null,
      restDaysOfWeek: u.restDaysOfWeek,
      year,
      month: month1,
      monthLabel: `${MONTHS[month0]} ${year}`,
      quincenas: [q1, q2],
      days,
      monthTotal: round2(q1.subtotal + q2.subtotal),
    };
  }

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
  ): Promise<PayrollPayment> {
    this.assertTodayIsWeekendOrThrow();
    const pago = paymentPeriodOf(parseYmd(periodStartYmd));
    if (pago.end.getTime() > todayUtc().getTime()) {
      throw new BadRequestException(
        `Este pago todavía no termina (cierra el ${ymd(pago.end)}). No se puede marcar pagado aún.`,
      );
    }
    const approverId = await this.approvals.verify(pin);
    const user = await this.getEmploymentUser(userId);

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
    const { base } = await this.computePagoBase(user, pago);
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
      },
      update: {
        status: 'PAID',
        amount,
        resolvedAt: new Date(),
        actorId,
        proofImageKey: stored.key,
        note: note ?? null,
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
    return toPayment(row, (await this.fetchActorNames([actorId])).get(actorId) ?? null);
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

  /** Mapa id→fullName para una lista de actor ids (filtra nulos + dedupea). */
  private async fetchActorNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private async getEmploymentUser(userId: string): Promise<EmploymentUser> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
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
    });
    if (!u) throw new NotFoundException(`Usuario ${userId} no encontrado`);
    return u;
  }

  // ==================================================================
  // CASH-FLOW HELPERS — usados por FinanceSummaryService (/finanzas).
  // ==================================================================

  /** Sub-pagos cerrados (periodEnd <= asOf) sin marcar como PAGADO.
   *  Mira hasta `lookbackMonths` meses atrás (default 6) por seguridad. */
  async getPendingPayments(
    asOf: Date = todayUtc(),
    lookbackMonths = 6,
  ): Promise<FinancePendingPayroll[]> {
    const earliest = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - lookbackMonths, 1));

    const users = await this.prisma.user.findMany({
      where: {
        payType: { not: null },
        hireDate: { lte: asOf },
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

    const paidRows = await this.prisma.payrollPayment.findMany({
      where: { status: 'PAID' },
      select: { userId: true, periodStart: true },
    });
    const paidSet = new Set(paidRows.map((p) => `${p.userId}|${ymd(p.periodStart)}`));

    const out: FinancePendingPayroll[] = [];
    for (const u of users) {
      const hire = u.hireDate ?? earliest;
      const startScan = maxDate(hire, earliest);
      // Iterar por mes y por cada uno de los 4 sub-pagos.
      const fromY = startScan.getUTCFullYear();
      const fromM = startScan.getUTCMonth();
      const toY = asOf.getUTCFullYear();
      const toM = asOf.getUTCMonth();
      for (let y = fromY, m = fromM; y < toY || (y === toY && m <= toM); ) {
        for (const start of pagoStartsOfMonth(y, m)) {
          const pago = pagoFromStart(start);
          // Solo sub-pagos cerrados: end <= asOf.
          if (pago.end.getTime() > asOf.getTime()) continue;
          // Sin pagar.
          if (paidSet.has(`${u.id}|${ymd(pago.start)}`)) continue;
          // El trabajador estaba empleado en al menos parte del pago.
          if (u.terminationDate && u.terminationDate < pago.start) continue;
          if (u.hireDate && u.hireDate > pago.end) continue;

          const { base } = await this.computePagoBase(u as EmploymentUser, pago);
          const adjAgg = await this.prisma.payrollAdjustment.aggregate({
            where: { userId: u.id, periodStart: pago.start },
            _sum: { amount: true },
          });
          const total = round2(base + Number(adjAgg._sum.amount ?? 0));
          if (total <= 0) continue;
          out.push({
            userId: u.id,
            userName: u.fullName,
            periodStart: ymd(pago.start),
            periodLabel: pagoLabel(pago),
            total,
          });
        }
        // Avanzar 1 mes.
        m += 1;
        if (m === 12) { m = 0; y += 1; }
      }
    }
    // Más viejo primero (más urgente).
    out.sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.userName.localeCompare(b.userName));
    return out;
  }

  /** Pagos de nómina PAID con resolvedAt en [from, to]. */
  async getPaidPaymentsInRange(from: Date, to: Date): Promise<FinancePaidPayroll[]> {
    const rows = await this.prisma.payrollPayment.findMany({
      where: { status: 'PAID', resolvedAt: { gte: from, lte: to } },
      orderBy: { resolvedAt: 'desc' },
      include: { user: { select: { fullName: true } } },
    });
    return rows.map((r) => {
      const pago = paymentPeriodOf(r.periodStart);
      return {
        paymentId: r.id,
        userId: r.userId,
        userName: r.user.fullName,
        periodStart: ymd(r.periodStart),
        periodLabel: pagoLabel(pago),
        amount: Number(r.amount),
        paidAt: r.resolvedAt.toISOString(),
        hasProof: r.proofImageKey !== null,
      };
    });
  }
}

function toDay(row: { id: string; userId: string; workDate: Date; amount: Prisma.Decimal; note: string | null; createdAt: Date }): PayrollDay {
  return {
    id: row.id,
    userId: row.userId,
    workDate: row.workDate.toISOString().slice(0, 10),
    amount: Number(row.amount),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPayment(
  row: {
    id: string;
    userId: string;
    periodStart: Date;
    status: string;
    amount: Prisma.Decimal;
    resolvedAt: Date;
    actorId: string | null;
    proofImageKey: string | null;
    note: string | null;
  },
  actorName: string | null,
): PayrollPayment {
  return {
    id: row.id,
    userId: row.userId,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    status: row.status as 'PAID' | 'CANCELLED',
    amount: Number(row.amount),
    resolvedAt: row.resolvedAt.toISOString(),
    actorName,
    hasProof: row.proofImageKey !== null,
    note: row.note,
  };
}

function toAdjustment(row: {
  id: string; userId: string; periodStart: Date; concept: string; amount: Prisma.Decimal; note: string | null; createdAt: Date;
}): PayrollAdjustment {
  return {
    id: row.id,
    userId: row.userId,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    concept: row.concept,
    amount: Number(row.amount),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
