import { Injectable } from '@nestjs/common';
import {
  NON_REVENUE_SALE_STATUSES,
  type FinanceMoneyFlow,
  type FinancePaidInvoice,
  type FinancePaidPayable,
  type FinancePendingInvoice,
  type FinancePendingPayable,
  type FinanceSummary,
} from '@pos-tercos/types';
import { BusinessConfigService } from '../business-config/business-config.service';
import { ymdLocal } from '../common/local-dates';
import { FixedCostsService } from '../fixed-costs/fixed-costs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkersWeeklyService } from '../workers/workers-weekly.service';

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
    private readonly workers: WorkersWeeklyService,
    private readonly fixedCosts: FixedCostsService,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  async getMonthlySummary(year: number, month1: number): Promise<FinanceSummary> {
    const month0 = month1 - 1;
    // Misma ventana del "mes del negocio" (hora local, fuente única en
    // BusinessConfigService) que el P&G accrual, para que "Ingresos del mes"
    // coincida entre /finanzas/pagos y /finanzas/estado.
    const { from: monthStart, to: monthEnd } =
      await this.businessConfig.getBusinessMonthWindow(year, month1);

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
      pendingPayableRows,
      paidPayableRows,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          paidAt: { gte: monthStart, lte: monthEnd },
          status: { notIn: [...NON_REVENUE_SALE_STATUSES] },
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
      // Compromisos por pagar: pendientes = TODOS los PENDING (deuda global,
      // no se filtra por mes); pagados = los PAID con paidAt en el mes.
      this.prisma.payableCommitment.findMany({
        where: { status: 'PENDING' },
        select: { id: true, beneficiary: true, description: true, amount: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.payableCommitment.findMany({
        where: { status: 'PAID', paidAt: { gte: monthStart, lte: monthEnd } },
        select: { id: true, beneficiary: true, description: true, amount: true, paidAt: true, proofImageKey: true },
        orderBy: [{ paidAt: 'desc' }],
      }),
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

    const pendingPayables: FinancePendingPayable[] = pendingPayableRows.map((r) => ({
      id: r.id,
      beneficiary: r.beneficiary,
      description: r.description,
      amount: Number(r.amount),
    }));
    const paidPayables: FinancePaidPayable[] = paidPayableRows.map((r) => ({
      id: r.id,
      beneficiary: r.beneficiary,
      description: r.description,
      amount: Number(r.amount),
      paidAt: (r.paidAt as Date).toISOString(),
      hasProof: r.proofImageKey !== null,
    }));

    const pendingPayrollTotal = round(pendingPayroll.reduce((a, p) => a + p.total, 0));
    const pendingInvoicesTotal = round(pendingInvoices.reduce((a, p) => a + p.total, 0));
    const pendingFixedCostsTotal = round(pendingFixedCosts.reduce((a, p) => a + p.amount, 0));
    const pendingPayablesTotal = round(pendingPayables.reduce((a, p) => a + p.amount, 0));
    const paidPayrollTotal = round(paidPayroll.reduce((a, p) => a + p.amount, 0));
    const paidInvoicesTotal = round(paidInvoices.reduce((a, p) => a + p.total, 0));
    const paidFixedCostsTotal = round(paidFixedCosts.reduce((a, p) => a + p.amount, 0));
    const paidPayablesTotal = round(paidPayables.reduce((a, p) => a + p.amount, 0));

    const paid: FinanceMoneyFlow = {
      payroll: paidPayrollTotal,
      invoices: paidInvoicesTotal,
      fixedCosts: paidFixedCostsTotal,
      payables: paidPayablesTotal,
      total: round(paidPayrollTotal + paidInvoicesTotal + paidFixedCostsTotal + paidPayablesTotal),
    };
    const pending: FinanceMoneyFlow = {
      payroll: pendingPayrollTotal,
      invoices: pendingInvoicesTotal,
      fixedCosts: pendingFixedCostsTotal,
      payables: pendingPayablesTotal,
      total: round(pendingPayrollTotal + pendingInvoicesTotal + pendingFixedCostsTotal + pendingPayablesTotal),
    };
    const netCash = round(revenue - paid.total);

    return {
      year,
      month: month1,
      monthLabel: `${MONTHS_ES[month0]} ${year}`,
      periodStart: ymdLocal(monthStart),
      periodEnd: ymdLocal(monthEnd),
      revenue: round(revenue),
      paid,
      pending,
      netCash,
      pendingPayroll,
      pendingInvoices,
      pendingFixedCosts,
      pendingPayables,
      paidPayroll,
      paidInvoices,
      paidFixedCosts,
      paidPayables,
    };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
