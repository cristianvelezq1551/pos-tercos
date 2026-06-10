import { Injectable } from '@nestjs/common';
import type {
  FinanceMoneyFlow,
  FinancePaidInvoice,
  FinancePendingInvoice,
  FinanceSummary,
} from '@pos-tercos/types';
import { FixedCostsService } from '../fixed-costs/fixed-costs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkersService } from '../workers/workers.service';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Cockpit financiero (cash-based) — qué entró, qué pagué, qué debo.
 *
 * Esto es DISTINTO del FinancialReportsService que produce el P&G accrual
 * (revenue - COGS FIFO - costos fijos). Este servicio responde la pregunta
 * "estoy al día con mis pagos":
 *
 *  - Ingresos del mes (paidAt de ventas pagadas en el mes)
 *  - Egresos pagados ESTE MES (suma de comprobantes por nómina + facturas
 *    a proveedores con paidAt/resolvedAt en el rango).
 *  - Egresos PENDIENTES TOTALES (no filtra por mes — incluye atrasos para
 *    no esconder deuda vieja).
 *  - Neto = ingresos - egresosPagados.
 */
@Injectable()
export class FinanceSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workers: WorkersService,
    private readonly fixedCosts: FixedCostsService,
  ) {}

  async getMonthlySummary(year: number, month1: number): Promise<FinanceSummary> {
    const month0 = month1 - 1;
    const monthStart = new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59, 999));

    const now = new Date();
    const asOfForPending = now < monthEnd ? now : monthEnd;

    const [
      revenueAgg,
      pendingPayroll,
      paidPayroll,
      pendingInvoiceRows,
      paidInvoiceRows,
      pendingFixedCosts,
      paidFixedCosts,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          paidAt: { gte: monthStart, lte: monthEnd },
          status: { notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'] },
        },
        _sum: { total: true },
      }),
      this.workers.getPendingPayments(asOfForPending),
      this.workers.getPaidPaymentsInRange(monthStart, monthEnd),
      this.prisma.invoice.findMany({
        where: { status: 'CONFIRMED', paymentStatus: 'PENDING' },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          confirmedAt: true,
          supplier: { select: { name: true } },
        },
        orderBy: [{ confirmedAt: 'asc' }],
      }),
      this.prisma.invoice.findMany({
        where: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          paidAt: true,
          paymentProofKey: true,
          supplier: { select: { name: true } },
        },
        orderBy: [{ paidAt: 'desc' }],
      }),
      this.fixedCosts.getPendingPayments(asOfForPending),
      this.fixedCosts.getPaidPaymentsInRange(monthStart, monthEnd),
    ]);

    const revenue = Number(revenueAgg._sum.total ?? 0);

    const pendingInvoices: FinancePendingInvoice[] = pendingInvoiceRows.map((r) => ({
      invoiceId: r.id,
      supplierName: r.supplier?.name ?? null,
      invoiceNumber: r.invoiceNumber,
      total: r.total !== null ? Number(r.total) : 0,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
    }));

    const paidInvoices: FinancePaidInvoice[] = paidInvoiceRows.map((r) => ({
      invoiceId: r.id,
      supplierName: r.supplier?.name ?? null,
      invoiceNumber: r.invoiceNumber,
      total: r.total !== null ? Number(r.total) : 0,
      paidAt: (r.paidAt as Date).toISOString(),
      hasProof: r.paymentProofKey !== null,
    }));

    const pendingPayrollTotal = round(pendingPayroll.reduce((a, p) => a + p.total, 0));
    const pendingInvoicesTotal = round(pendingInvoices.reduce((a, p) => a + p.total, 0));
    const pendingFixedCostsTotal = round(pendingFixedCosts.reduce((a, p) => a + p.amount, 0));
    const paidPayrollTotal = round(paidPayroll.reduce((a, p) => a + p.amount, 0));
    const paidInvoicesTotal = round(paidInvoices.reduce((a, p) => a + p.total, 0));
    const paidFixedCostsTotal = round(paidFixedCosts.reduce((a, p) => a + p.amount, 0));

    const paid: FinanceMoneyFlow = {
      payroll: paidPayrollTotal,
      invoices: paidInvoicesTotal,
      fixedCosts: paidFixedCostsTotal,
      total: round(paidPayrollTotal + paidInvoicesTotal + paidFixedCostsTotal),
    };
    const pending: FinanceMoneyFlow = {
      payroll: pendingPayrollTotal,
      invoices: pendingInvoicesTotal,
      fixedCosts: pendingFixedCostsTotal,
      total: round(pendingPayrollTotal + pendingInvoicesTotal + pendingFixedCostsTotal),
    };
    const netCash = round(revenue - paid.total);

    return {
      year,
      month: month1,
      monthLabel: `${MONTHS_ES[month0]} ${year}`,
      periodStart: ymd(monthStart),
      periodEnd: ymd(monthEnd),
      revenue: round(revenue),
      paid,
      pending,
      netCash,
      pendingPayroll,
      pendingInvoices,
      pendingFixedCosts,
      paidPayroll,
      paidInvoices,
      paidFixedCosts,
    };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
