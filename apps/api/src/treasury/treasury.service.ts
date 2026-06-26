import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NON_REVENUE_SALE_STATUSES,
  type CreateAdjustment,
  type CreateTransfer,
  type Pocket,
  type PocketBreakdown,
  type TreasuryConfig,
  type TreasuryMovement,
  type TreasurySummary,
  type UpdateTreasuryConfig,
} from '@pos-tercos/types';
import type { SaleStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { FixedCostsService } from '../fixed-costs/fixed-costs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkersWeeklyService } from '../workers/workers-weekly.service';
import { WorkersService } from '../workers/workers.service';

const SINGLETON = 'singleton';
// CANCELADO_SIN_REEMBOLSO sí cuenta como ingreso (no está en la lista canónica).
const EXCLUDED_SALE_STATUS: SaleStatus[] = [...NON_REVENUE_SALE_STATUSES];

/**
 * Tesorería — control de caja de dos bolsillos (Efectivo y Cuenta). Deriva los
 * saldos de lo que el POS ya registra (ventas por método + gastos por su
 * bolsillo) y le suma traspasos y ajustes manuales. NO lee `cash_movements`
 * del turno: eso es para el arqueo diario del cajero (evita "dos verdades").
 */
@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fixedCosts: FixedCostsService,
    private readonly workers: WorkersService,
    private readonly workersWeekly: WorkersWeeklyService,
  ) {}

  // --- Config ---

  async getConfig(): Promise<TreasuryConfig> {
    const row = await this.prisma.treasuryConfig.upsert({
      where: { id: SINGLETON },
      update: {},
      create: { id: SINGLETON },
    });
    return {
      anchorDate: row.anchorDate ? row.anchorDate.toISOString().slice(0, 10) : null,
      initialCash: Number(row.initialCash),
      initialBank: Number(row.initialBank),
    };
  }

  async updateConfig(input: UpdateTreasuryConfig, actorId: string): Promise<TreasuryConfig> {
    const before = await this.getConfig();
    const row = await this.prisma.treasuryConfig.upsert({
      where: { id: SINGLETON },
      update: {
        anchorDate: input.anchorDate ? parseYmd(input.anchorDate) : null,
        initialCash: input.initialCash,
        initialBank: input.initialBank,
      },
      create: {
        id: SINGLETON,
        anchorDate: input.anchorDate ? parseYmd(input.anchorDate) : null,
        initialCash: input.initialCash,
        initialBank: input.initialBank,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'TREASURY_CONFIG_UPDATED',
      entityType: 'treasury_config',
      entityId: SINGLETON,
      before,
      after: { anchorDate: input.anchorDate, initialCash: input.initialCash, initialBank: input.initialBank },
    });
    return {
      anchorDate: row.anchorDate ? row.anchorDate.toISOString().slice(0, 10) : null,
      initialCash: Number(row.initialCash),
      initialBank: Number(row.initialBank),
    };
  }

  // --- Movimientos manuales ---

  async listMovements(limit = 100): Promise<TreasuryMovement[]> {
    const rows = await this.prisma.treasuryMovement.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    const actorNames = await this.workers.fetchActorNames(rows.map((r) => r.actorId));
    return rows.map((r) => this.toMovementDto(r, actorNames.get(r.actorId ?? '') ?? null));
  }

  async createTransfer(input: CreateTransfer, actorId: string): Promise<TreasuryMovement> {
    if (input.fromPocket === input.toPocket) {
      throw new BadRequestException('El origen y el destino deben ser distintos.');
    }
    const row = await this.prisma.treasuryMovement.create({
      data: {
        kind: 'TRANSFER',
        fromPocket: input.fromPocket,
        toPocket: input.toPocket,
        amount: input.amount,
        reason: input.reason,
        actorId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'TREASURY_TRANSFER_CREATED',
      entityType: 'treasury_movement',
      entityId: row.id,
      metadata: { from: input.fromPocket, to: input.toPocket, amount: input.amount, reason: input.reason },
    });
    return this.toMovementDto(row, null);
  }

  async createAdjustment(input: CreateAdjustment, actorId: string): Promise<TreasuryMovement> {
    const row = await this.prisma.treasuryMovement.create({
      data: {
        kind: 'ADJUSTMENT',
        pocket: input.pocket,
        amount: input.amount,
        reason: input.reason,
        actorId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'TREASURY_ADJUSTMENT_CREATED',
      entityType: 'treasury_movement',
      entityId: row.id,
      metadata: { pocket: input.pocket, amount: input.amount, reason: input.reason },
    });
    return this.toMovementDto(row, null);
  }

  async voidMovement(id: string, actorId: string): Promise<void> {
    const row = await this.prisma.treasuryMovement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Movimiento no encontrado.');
    if (row.status === 'VOIDED') return;
    await this.prisma.treasuryMovement.update({ where: { id }, data: { status: 'VOIDED' } });
    await this.audit.log({
      userId: actorId,
      action: 'TREASURY_MOVEMENT_VOIDED',
      entityType: 'treasury_movement',
      entityId: id,
      metadata: { kind: row.kind, amount: Number(row.amount) },
    });
  }

  // --- Panel ---

  async getSummary(): Promise<TreasurySummary> {
    const cfg = await this.getConfig();
    const anchor = cfg.anchorDate ? parseYmd(cfg.anchorDate) : new Date(0);

    const [incomeRows, invPaid, fcPaid, pqPaid, pwPaid, paPaid, movements] = await Promise.all([
      this.prisma.salePayment.groupBy({
        by: ['method'],
        where: { sale: { paidAt: { gte: anchor, not: null }, status: { notIn: EXCLUDED_SALE_STATUS } } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { paymentStatus: 'PAID', paidAt: { gte: anchor } },
        _sum: { paymentCashAmount: true, paymentBankAmount: true },
      }),
      this.prisma.fixedCostPayment.aggregate({
        where: { paidAt: { gte: anchor } },
        _sum: { cashAmount: true, bankAmount: true },
      }),
      this.prisma.payrollPayment.aggregate({
        where: { status: 'PAID', resolvedAt: { gte: anchor } },
        _sum: { cashAmount: true, bankAmount: true },
      }),
      this.prisma.payrollWeekPayment.aggregate({
        where: { status: 'PAID', paidAt: { gte: anchor } },
        _sum: { cashAmount: true, bankAmount: true },
      }),
      this.prisma.payableCommitment.aggregate({
        where: { status: 'PAID', paidAt: { gte: anchor } },
        _sum: { cashAmount: true, bankAmount: true },
      }),
      this.prisma.treasuryMovement.findMany({ where: { status: 'ACTIVE', occurredAt: { gte: anchor } } }),
    ]);

    let cashIncome = 0;
    let bankIncome = 0;
    for (const r of incomeRows) {
      const v = Number(r._sum.amount ?? 0);
      if (r.method === 'CASH') cashIncome += v;
      else bankIncome += v;
    }

    // Todos los gastos traen su reparto por bolsillo (efectivo/cuenta/mixto).
    const cashExp =
      Number(invPaid._sum.paymentCashAmount ?? 0) +
      Number(fcPaid._sum.cashAmount ?? 0) +
      Number(pqPaid._sum.cashAmount ?? 0) +
      Number(pwPaid._sum.cashAmount ?? 0) +
      Number(paPaid._sum.cashAmount ?? 0);
    const bankExp =
      Number(invPaid._sum.paymentBankAmount ?? 0) +
      Number(fcPaid._sum.bankAmount ?? 0) +
      Number(pqPaid._sum.bankAmount ?? 0) +
      Number(pwPaid._sum.bankAmount ?? 0) +
      Number(paPaid._sum.bankAmount ?? 0);

    let cashIn = 0;
    let cashOut = 0;
    let bankIn = 0;
    let bankOut = 0;
    let cashAdj = 0;
    let bankAdj = 0;
    for (const m of movements) {
      const amt = Number(m.amount);
      if (m.kind === 'TRANSFER') {
        if (m.fromPocket === 'EFECTIVO') cashOut += amt;
        else bankOut += amt;
        if (m.toPocket === 'EFECTIVO') cashIn += amt;
        else bankIn += amt;
      } else {
        if (m.pocket === 'EFECTIVO') cashAdj += amt;
        else bankAdj += amt;
      }
    }

    const cash = breakdown('EFECTIVO', cfg.initialCash, cashIncome, cashExp, cashIn, cashOut, cashAdj);
    const bank = breakdown('CUENTA', cfg.initialBank, bankIncome, bankExp, bankIn, bankOut, bankAdj);
    const total = round(cash.balance + bank.balance);

    const { commitmentsTotal, commitmentsByResponsible } = await this.computeCommitments();

    return {
      asOf: new Date().toISOString(),
      anchorDate: cfg.anchorDate,
      cash,
      bank,
      total,
      commitmentsTotal,
      commitmentsByResponsible,
      projected: round(total - commitmentsTotal),
    };
  }

  /** Compromisos pendientes agrupados por responsable. */
  private async computeCommitments(): Promise<{
    commitmentsTotal: number;
    commitmentsByResponsible: Array<{ responsible: string; total: number }>;
  }> {
    const now = new Date();
    const [pendingInvoices, pendingFixed, pendingPayroll, pendingPayables] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { status: 'CONFIRMED', paymentStatus: 'PENDING' },
        select: { total: true, responsible: true },
      }),
      this.fixedCosts.getPendingPayments(now),
      this.workersWeekly.getPendingPayments(now),
      this.prisma.payableCommitment.findMany({
        where: { status: 'PENDING' },
        select: { beneficiary: true, amount: true },
      }),
    ]);
    const fixedIds = pendingFixed.map((f) => f.fixedCostId);
    const fixedResp = fixedIds.length
      ? await this.prisma.fixedCost.findMany({ where: { id: { in: fixedIds } }, select: { id: true, responsible: true } })
      : [];
    const respMap = new Map(fixedResp.map((f) => [f.id, f.responsible]));

    const byResp = new Map<string, number>();
    const add = (resp: string | null, v: number): void => {
      const key = resp && resp.trim() ? resp.trim() : 'Sin asignar';
      byResp.set(key, (byResp.get(key) ?? 0) + v);
    };
    for (const i of pendingInvoices) add(i.responsible, i.total !== null ? Number(i.total) : 0);
    for (const f of pendingFixed) add(respMap.get(f.fixedCostId) ?? null, f.amount);
    for (const p of pendingPayables) add(p.beneficiary, Number(p.amount));
    const payrollTotal = pendingPayroll.reduce((a, p) => a + p.total, 0);
    if (payrollTotal > 0) add('Nómina', payrollTotal);

    const commitmentsByResponsible = Array.from(byResp.entries())
      .map(([responsible, total]) => ({ responsible, total: round(total) }))
      .sort((a, b) => b.total - a.total);
    const commitmentsTotal = round(commitmentsByResponsible.reduce((a, r) => a + r.total, 0));
    return { commitmentsTotal, commitmentsByResponsible };
  }

  private toMovementDto(
    row: {
      id: string;
      kind: string;
      fromPocket: string | null;
      toPocket: string | null;
      pocket: string | null;
      amount: { toString(): string };
      reason: string;
      status: string;
      occurredAt: Date;
    },
    actorName: string | null,
  ): TreasuryMovement {
    return {
      id: row.id,
      kind: row.kind as 'TRANSFER' | 'ADJUSTMENT',
      fromPocket: row.fromPocket as Pocket | null,
      toPocket: row.toPocket as Pocket | null,
      pocket: row.pocket as Pocket | null,
      amount: Number(row.amount),
      reason: row.reason,
      status: row.status as 'ACTIVE' | 'VOIDED',
      occurredAt: row.occurredAt.toISOString(),
      actorName,
    };
  }
}

function breakdown(
  pocket: Pocket,
  initial: number,
  income: number,
  expensesPaid: number,
  transfersIn: number,
  transfersOut: number,
  adjustments: number,
): PocketBreakdown {
  const balance = round(initial + income - expensesPaid + transfersIn - transfersOut + adjustments);
  return {
    pocket,
    initial: round(initial),
    income: round(income),
    expensesPaid: round(expensesPaid),
    transfersIn: round(transfersIn),
    transfersOut: round(transfersOut),
    adjustments: round(adjustments),
    balance,
  };
}

function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
