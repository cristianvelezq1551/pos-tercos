import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StorageProvider } from '@pos-tercos/domain';
import type {
  CreateFixedCost,
  FinancePaidFixedCost,
  FinancePendingFixedCost,
  FixedCost,
  FixedCostFrequency,
  UpdateFixedCost,
} from '@pos-tercos/types';
import type { FixedCost as DbFixedCost, Prisma } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { AuditService } from '../audit/audit.service';
import { mimeForExtension } from '../common/image-mime';
import { utcDateOfLocalDay } from '../common/local-dates';
import { resolvePocketSplit } from '../common/pocket-split';
import { PrismaService } from '../prisma/prisma.service';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

@Injectable()
export class FixedCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async list(opts: { onlyActive?: boolean } = {}): Promise<FixedCost[]> {
    const where: Prisma.FixedCostWhereInput = {};
    if (opts.onlyActive) where.isActive = true;
    const rows = await this.prisma.fixedCost.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    return rows.map(toDto);
  }

  async getById(id: string): Promise<FixedCost> {
    const row = await this.prisma.fixedCost.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`FixedCost ${id} not found`);
    return toDto(row);
  }

  async create(input: CreateFixedCost, actorId: string): Promise<FixedCost> {
    // Puntual: la vigencia es UN solo día (su fecha) → endedAt = startedAt, así
    // getEffectiveForWindow lo cuenta solo en el mes de esa fecha.
    const startedAt = input.startedAt ? parseYmd(input.startedAt) : null;
    const endedAt =
      input.frequency === 'ONE_TIME'
        ? startedAt
        : input.endedAt
          ? parseYmd(input.endedAt)
          : null;
    const row = await this.prisma.fixedCost.create({
      data: {
        name: input.name,
        amount: input.amount,
        frequency: input.frequency,
        category: input.category,
        startedAt,
        endedAt,
        notes: input.notes ?? null,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'FIXED_COST_CREATED',
      entityType: 'fixed_cost',
      entityId: row.id,
      metadata: { name: input.name, amount: input.amount, frequency: input.frequency, category: input.category },
    });
    return toDto(row);
  }

  async update(id: string, input: UpdateFixedCost, actorId: string): Promise<FixedCost> {
    const before = await this.getById(id);
    const data: Prisma.FixedCostUpdateInput = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.frequency !== undefined && { frequency: input.frequency }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.startedAt !== undefined && {
        startedAt: input.startedAt ? parseYmd(input.startedAt) : null,
      }),
      ...(input.endedAt !== undefined && {
        endedAt: input.endedAt ? parseYmd(input.endedAt) : null,
      }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    };
    // Puntual: forzar endedAt = startedAt (vigencia de un día) según el estado final.
    const finalFreq = input.frequency ?? before.frequency;
    if (finalFreq === 'ONE_TIME') {
      const finalStarted = input.startedAt !== undefined ? input.startedAt : before.startedAt;
      data.endedAt = finalStarted ? parseYmd(finalStarted) : null;
    }
    const row = await this.prisma.fixedCost.update({ where: { id }, data });
    await this.audit.log({
      userId: actorId,
      action: 'FIXED_COST_UPDATED',
      entityType: 'fixed_cost',
      entityId: id,
      metadata: { before: { amount: Number(before.amount), frequency: before.frequency }, changes: input },
    });
    return toDto(row);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.getById(id);
    await this.prisma.fixedCost.delete({ where: { id } });
    await this.audit.log({
      userId: actorId,
      action: 'FIXED_COST_DELETED',
      entityType: 'fixed_cost',
      entityId: id,
      metadata: { name: existing.name, amount: existing.amount },
    });
  }

  /**
   * Costos fijos activos cuya vigencia (startedAt/endedAt) se cruza con la
   * ventana [windowStart, windowEnd]. Se usa con la ventana del "mes del
   * negocio" (21–20, etc.) del estado financiero — NO el mes calendario — para
   * que la vigencia coincida con el período que muestra la pantalla. Mensual =
   * monto tal cual; Anual = ÷12. El monto NO se prorratea: cuenta UNA vez por
   * ventana.
   *
   * startedAt/endedAt son fecha-solo (medianoche UTC): la ventana local se
   * convierte a límites fecha-solo — sin esto, un gasto puntual fechado el
   * día 1 caía en el mes ANTERIOR y desaparecía del suyo.
   */
  async getEffectiveForWindow(windowStart: Date, windowEnd: Date): Promise<
    Array<{ id: string; name: string; category: string; monthlyAmount: number; isOneTime: boolean }>
  > {
    const startDay = utcDateOfLocalDay(windowStart);
    const endDay = utcDateOfLocalDay(windowEnd);
    const rows = await this.prisma.fixedCost.findMany({
      where: {
        isActive: true,
        OR: [{ startedAt: null }, { startedAt: { lte: endDay } }],
        AND: [{ OR: [{ endedAt: null }, { endedAt: { gte: startDay } }] }],
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      monthlyAmount: r.frequency === 'ANNUAL' ? Number(r.amount) / 12 : Number(r.amount),
      isOneTime: r.frequency === 'ONE_TIME',
    }));
  }

  // ==================================================================
  // CONTROL DE PAGO (solo Dueño + PIN). Patrón espejo de invoices/payroll.
  // ==================================================================

  /** Marca como pagado un costo fijo para un período (año, mes). */
  async markPaid(
    fixedCostId: string,
    periodYear: number,
    periodMonth: number,
    pin: string,
    actorId: string,
    proof: { buffer: Buffer; mime: string; ext: string },
    opts: { paidAtYmd?: string; amount?: number; note?: string; cashAmount?: number; bankAmount?: number },
  ): Promise<FinancePaidFixedCost> {
    const approverId = await this.approvals.verify(pin);
    const cost = await this.prisma.fixedCost.findUnique({ where: { id: fixedCostId } });
    if (!cost) throw new NotFoundException(`FixedCost ${fixedCostId} not found`);
    if (periodMonth < 1 || periodMonth > 12) {
      throw new BadRequestException('periodMonth debe estar entre 1 y 12.');
    }
    if (cost.frequency === 'ANNUAL' && periodMonth !== 1) {
      throw new BadRequestException('Para costos ANUALES el período debe ser enero (periodMonth=1).');
    }

    const amount = opts.amount ?? Number(cost.amount);
    const split = resolvePocketSplit(opts.cashAmount, opts.bankAmount, amount);
    const paidAt = opts.paidAtYmd
      ? new Date(`${opts.paidAtYmd}T12:00:00.000Z`)
      : new Date();

    // Upload + cleanup del previo si la key cambió.
    const stored = await this.storage.put(
      `fixed-costs/${fixedCostId}`,
      proof.buffer,
      proof.mime,
      proof.ext,
    );
    const existing = await this.prisma.fixedCostPayment.findUnique({
      where: {
        fixedCostId_periodYear_periodMonth: { fixedCostId, periodYear, periodMonth },
      },
    });
    if (existing?.proofImageKey && existing.proofImageKey !== stored.key) {
      await this.storage.delete(existing.proofImageKey).catch(() => undefined);
    }

    const row = await this.prisma.fixedCostPayment.upsert({
      where: {
        fixedCostId_periodYear_periodMonth: { fixedCostId, periodYear, periodMonth },
      },
      create: {
        fixedCostId,
        periodYear,
        periodMonth,
        amount,
        paidAt,
        proofImageKey: stored.key,
        actorId,
        note: opts.note ?? null,
        paymentPocket: split.cash > 0 && split.bank === 0 ? 'EFECTIVO' : split.cash === 0 ? 'CUENTA' : 'MIXTO',
        cashAmount: split.cash,
        bankAmount: split.bank,
      },
      update: {
        amount,
        paidAt,
        proofImageKey: stored.key,
        actorId,
        note: opts.note ?? null,
        paymentPocket: split.cash > 0 && split.bank === 0 ? 'EFECTIVO' : split.cash === 0 ? 'CUENTA' : 'MIXTO',
        cashAmount: split.cash,
        bankAmount: split.bank,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'FIXED_COST_PAYMENT_MARKED',
      entityType: 'fixed_cost_payment',
      entityId: row.id,
      metadata: {
        approverId,
        fixedCostId,
        fixedCostName: cost.name,
        periodYear,
        periodMonth,
        amount,
        paidAt: paidAt.toISOString(),
        proofImageKey: stored.key,
      },
    });
    return {
      paymentId: row.id,
      fixedCostId,
      name: cost.name,
      category: cost.category,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      periodLabel: periodLabel(cost.name, cost.frequency, row.periodYear, row.periodMonth),
      amount: Number(row.amount),
      paidAt: row.paidAt.toISOString(),
      hasProof: true,
    };
  }

  /** Revierte un pago: borra registro + comprobante. */
  async unmarkPayment(
    fixedCostId: string,
    periodYear: number,
    periodMonth: number,
    pin: string,
    actorId: string,
  ): Promise<void> {
    const approverId = await this.approvals.verify(pin);
    const existing = await this.prisma.fixedCostPayment.findUnique({
      where: {
        fixedCostId_periodYear_periodMonth: { fixedCostId, periodYear, periodMonth },
      },
    });
    if (!existing) return; // idempotente
    if (existing.proofImageKey) {
      await this.storage.delete(existing.proofImageKey).catch(() => undefined);
    }
    await this.prisma.fixedCostPayment.delete({ where: { id: existing.id } });
    await this.audit.log({
      userId: actorId,
      action: 'FIXED_COST_PAYMENT_UNMARKED',
      entityType: 'fixed_cost_payment',
      entityId: existing.id,
      metadata: { approverId, fixedCostId, periodYear, periodMonth },
    });
  }

  async getPaymentProof(paymentId: string): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.prisma.fixedCostPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw new NotFoundException('Comprobante no encontrado.');
    const buffer = await this.storage.get(row.proofImageKey);
    const ext = row.proofImageKey.split('.').pop() ?? '';
    return { buffer, mime: mimeForExtension(ext) };
  }

  // ==================================================================
  // CASH-FLOW HELPERS (usados por FinanceSummaryService).
  // ==================================================================

  /** Períodos sin pago, mirando hasta `lookbackMonths` meses atrás (default 6). */
  async getPendingPayments(
    asOf: Date = new Date(),
    lookbackMonths = 6,
  ): Promise<FinancePendingFixedCost[]> {
    // `asOf` llega como instante LOCAL (now o fin de ventana). Se normaliza al
    // día calendario local en medianoche UTC — con getUTC* directo, el 31 a las
    // 19:00 Bogotá ya era "el mes siguiente" y listaba sus períodos como deuda.
    const asOfDay = utcDateOfLocalDay(asOf);
    const asOfY = asOfDay.getUTCFullYear();
    const asOfM = asOfDay.getUTCMonth(); // 0-11
    const earliestY = asOfY;
    const earliestM = asOfM - lookbackMonths;
    const earliestStart = new Date(Date.UTC(earliestY, earliestM, 1));

    // Costos potencialmente vigentes en cualquier momento del rango.
    const costs = await this.prisma.fixedCost.findMany({
      where: {
        isActive: true,
        OR: [{ endedAt: null }, { endedAt: { gte: earliestStart } }],
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    // Set de (costId|year|month) ya pagados.
    const paidRows = await this.prisma.fixedCostPayment.findMany({
      where: {
        fixedCostId: { in: costs.map((c) => c.id) },
        OR: [
          { periodYear: { gt: earliestStart.getUTCFullYear() } },
          {
            periodYear: earliestStart.getUTCFullYear(),
            periodMonth: { gte: earliestStart.getUTCMonth() + 1 },
          },
        ],
      },
      select: { fixedCostId: true, periodYear: true, periodMonth: true },
    });
    const paidSet = new Set(
      paidRows.map((r) => `${r.fixedCostId}|${r.periodYear}|${r.periodMonth}`),
    );

    const out: FinancePendingFixedCost[] = [];
    for (const c of costs) {
      const periods = enumeratePeriodsForCost(c, earliestStart, asOfDay);
      for (const p of periods) {
        if (paidSet.has(`${c.id}|${p.year}|${p.month}`)) continue;
        out.push({
          fixedCostId: c.id,
          name: c.name,
          category: c.category,
          periodYear: p.year,
          periodMonth: p.month,
          periodLabel: periodLabel(c.name, c.frequency, p.year, p.month),
          amount: Number(c.amount),
        });
      }
    }
    // Más viejo primero (más urgente).
    out.sort(
      (a, b) =>
        a.periodYear - b.periodYear ||
        a.periodMonth - b.periodMonth ||
        a.name.localeCompare(b.name),
    );
    return out;
  }

  /** Pagos con paidAt en [from, to]. */
  async getPaidPaymentsInRange(from: Date, to: Date): Promise<FinancePaidFixedCost[]> {
    const rows = await this.prisma.fixedCostPayment.findMany({
      where: { paidAt: { gte: from, lte: to } },
      orderBy: { paidAt: 'desc' },
      include: { fixedCost: { select: { name: true, category: true, frequency: true } } },
    });
    return rows.map((r) => ({
      paymentId: r.id,
      fixedCostId: r.fixedCostId,
      name: r.fixedCost.name,
      category: r.fixedCost.category,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      periodLabel: periodLabel(
        r.fixedCost.name,
        r.fixedCost.frequency,
        r.periodYear,
        r.periodMonth,
      ),
      amount: Number(r.amount),
      paidAt: r.paidAt.toISOString(),
      hasProof: true,
    }));
  }
}

/** Enumera (year, month) en rango para un costo según su frecuencia y vigencia. */
function enumeratePeriodsForCost(
  cost: DbFixedCost,
  earliestStart: Date,
  asOf: Date,
): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  const costStart = cost.startedAt ?? earliestStart;
  const effectiveStart = costStart > earliestStart ? costStart : earliestStart;
  const effectiveEnd = cost.endedAt && cost.endedAt < asOf ? cost.endedAt : asOf;
  if (effectiveStart > effectiveEnd) return result;

  // PUNTUAL: un único período = el mes de su fecha, si cae en el rango.
  if (cost.frequency === 'ONE_TIME') {
    if (!cost.startedAt) return result;
    if (cost.startedAt < earliestStart || cost.startedAt > asOf) return result;
    result.push({
      year: cost.startedAt.getUTCFullYear(),
      month: cost.startedAt.getUTCMonth() + 1,
    });
    return result;
  }

  if (cost.frequency === 'MONTHLY') {
    let y = effectiveStart.getUTCFullYear();
    let m = effectiveStart.getUTCMonth() + 1; // 1-12
    const endY = effectiveEnd.getUTCFullYear();
    const endM = effectiveEnd.getUTCMonth() + 1;
    while (y < endY || (y === endY && m <= endM)) {
      result.push({ year: y, month: m });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return result;
  }
  // ANNUAL: 1 período por año (mes 1 por convención).
  for (let y = effectiveStart.getUTCFullYear(); y <= effectiveEnd.getUTCFullYear(); y++) {
    result.push({ year: y, month: 1 });
  }
  return result;
}

/** "Arriendo · mayo 2026" (MONTHLY/PUNTUAL) o "Tasa DIAN · 2026" (ANNUAL). */
function periodLabel(name: string, frequency: FixedCostFrequency, year: number, month: number): string {
  if (frequency === 'ANNUAL') return `${name} · ${year}`;
  return `${name} · ${MONTHS_ES[month - 1]} ${year}`;
}

function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function toDto(row: DbFixedCost): FixedCost {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    frequency: row.frequency,
    category: row.category,
    startedAt: row.startedAt ? row.startedAt.toISOString().slice(0, 10) : null,
    endedAt: row.endedAt ? row.endedAt.toISOString().slice(0, 10) : null,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
