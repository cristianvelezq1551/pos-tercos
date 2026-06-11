import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parseReconciliationCsv } from '@pos-tercos/domain';
import {
  ReconciliationReportSchema,
  type ReconciliationReport,
  type ReconciliationRow,
  type ReconciliationSource,
  type SavedReconciliation,
  type SavedReconciliationDetail,
} from '@pos-tercos/types';
import type { PaymentReconciliation, Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Tolerancia para considerar match temporal: ±N horas entre CSV y sale.paidAt. */
const TIME_TOLERANCE_HOURS = 24;

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==================================================================
  // FASE 14.D — PERSISTENCIA DE REPORTS
  // ==================================================================

  /** Guarda un report ya generado por reconcile(). Inmutable. */
  async saveReport(
    report: ReconciliationReport,
    userId: string,
  ): Promise<SavedReconciliation> {
    // Normalizamos a YYYY-MM-DD para que el rango sea legible.
    const fromDay = report.periodFrom.slice(0, 10);
    const toDay = report.periodTo.slice(0, 10);

    const created = await this.prisma.paymentReconciliation.create({
      data: {
        source: report.source,
        periodFrom: fromDay,
        periodTo: toDay,
        csvRowsParsed: report.csvRowsParsed,
        posSalesEvaluated: report.posSalesEvaluated,
        matched: report.summary.matched,
        unmatchedCsv: report.summary.unmatchedCsv,
        unmatchedSale: report.summary.unmatchedSale,
        reportJson: report as unknown as Prisma.InputJsonValue,
        importedById: userId,
      },
      include: { importedBy: { select: { fullName: true } } },
    });

    await this.audit.log({
      userId,
      action: 'RECONCILIATION_IMPORTED',
      entityType: 'payment_reconciliation',
      entityId: created.id,
      metadata: {
        source: report.source,
        periodFrom: fromDay,
        periodTo: toDay,
        matched: report.summary.matched,
        unmatchedCsv: report.summary.unmatchedCsv,
      },
    });

    return toSavedDto(created);
  }

  async listSaved(opts: {
    source?: ReconciliationSource;
    limit?: number;
  } = {}): Promise<SavedReconciliation[]> {
    const where: Prisma.PaymentReconciliationWhereInput = {};
    if (opts.source) where.source = opts.source;
    const rows = await this.prisma.paymentReconciliation.findMany({
      where,
      include: { importedBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
    });
    return rows.map(toSavedDto);
  }

  async getSavedDetail(id: string): Promise<SavedReconciliationDetail> {
    const row = await this.prisma.paymentReconciliation.findUnique({
      where: { id },
      include: { importedBy: { select: { fullName: true } } },
    });
    if (!row) throw new NotFoundException(`Reconciliation ${id} not found`);
    const parsed = ReconciliationReportSchema.safeParse(row.reportJson);
    if (!parsed.success) {
      throw new Error(`reportJson corrupto en reconciliation ${id}`);
    }
    return {
      ...toSavedDto(row),
      report: parsed.data,
    };
  }


  /**
   * FASE 11.E: parsea CSV, busca matches en sales del rango fecha vs txns
   * del CSV. NO persiste — el reporte se genera on-demand.
   *
   * Match strategy:
   *  1. Para cada CSV row, buscar sale con paymentMethod compatible (NEQUI/
   *     DAVIPLATA/QR_BANCOLOMBIA/TRANSFER), status=PAGADO, total = csvAmount,
   *     paidAt within ±24h del csvDate.
   *  2. Si encuentra una y solo una → 'matched'.
   *  3. Si CSV row sin sale → 'unmatched_csv' (red flag: pago en banco sin POS).
   *  4. Sales POS digitales en rango sin CSV match → 'unmatched_sale'.
   */
  async reconcile(source: ReconciliationSource, csvText: string): Promise<ReconciliationReport> {
    const csvRows = parseReconciliationCsv(csvText);
    if (csvRows.length === 0) {
      throw new BadRequestException('CSV vacío o sin filas válidas.');
    }

    const periodFrom = csvRows.reduce((min, r) => (r.date < min ? r.date : min), csvRows[0]!.date);
    const periodTo = csvRows.reduce((max, r) => (r.date > max ? r.date : max), csvRows[0]!.date);

    // Sales digitales del POS en el rango (con buffer ±24h para tolerancia).
    const bufferMs = TIME_TOLERANCE_HOURS * 60 * 60 * 1000;
    const compatibleMethods = methodsForSource(source);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'PAGADO',
        paymentMethod: {
          in: compatibleMethods as Prisma.EnumPaymentMethodNullableFilter['in'],
        },
        paidAt: {
          gte: new Date(periodFrom.getTime() - bufferMs),
          lte: new Date(periodTo.getTime() + bufferMs),
        },
      },
      select: {
        id: true,
        receiptNumber: true,
        total: true,
        paidAt: true,
        paymentMethod: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    // Greedy matching: para cada CSV row, buscar la primera sale candidata
    // que aún no esté tomada.
    const usedSaleIds = new Set<string>();
    const rows: ReconciliationRow[] = [];

    for (const csv of csvRows) {
      let match: typeof sales[number] | undefined;
      for (const sale of sales) {
        if (usedSaleIds.has(sale.id)) continue;
        if (Number(sale.total) !== csv.amount) continue;
        if (!sale.paidAt) continue;
        const dt = Math.abs(sale.paidAt.getTime() - csv.date.getTime());
        if (dt > bufferMs) continue;
        match = sale;
        break;
      }
      if (match) {
        usedSaleIds.add(match.id);
        rows.push({
          status: 'matched',
          csvDate: csv.date.toISOString(),
          csvAmount: csv.amount,
          csvReference: csv.reference,
          saleId: match.id,
          receiptNumber: Number(match.receiptNumber),
          saleTotal: Number(match.total),
          salePaidAt: match.paidAt!.toISOString(),
          paymentMethod: match.paymentMethod,
        });
      } else {
        rows.push({
          status: 'unmatched_csv',
          csvDate: csv.date.toISOString(),
          csvAmount: csv.amount,
          csvReference: csv.reference,
          saleId: null,
          receiptNumber: null,
          saleTotal: null,
          salePaidAt: null,
          paymentMethod: null,
        });
      }
    }

    // Sales digitales sin match en CSV
    for (const sale of sales) {
      if (usedSaleIds.has(sale.id)) continue;
      // Solo consideramos sin-match las sales que estén EN el periodo CSV (no en el buffer).
      if (!sale.paidAt) continue;
      if (sale.paidAt < periodFrom || sale.paidAt > periodTo) continue;
      rows.push({
        status: 'unmatched_sale',
        csvDate: null,
        csvAmount: null,
        csvReference: null,
        saleId: sale.id,
        receiptNumber: Number(sale.receiptNumber),
        saleTotal: Number(sale.total),
        salePaidAt: sale.paidAt.toISOString(),
        paymentMethod: sale.paymentMethod,
      });
    }

    const summary = {
      matched: rows.filter((r) => r.status === 'matched').length,
      unmatchedCsv: rows.filter((r) => r.status === 'unmatched_csv').length,
      unmatchedSale: rows.filter((r) => r.status === 'unmatched_sale').length,
    };

    return {
      source,
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      csvRowsParsed: csvRows.length,
      posSalesEvaluated: sales.length,
      summary,
      rows,
    };
  }
}

function methodsForSource(source: ReconciliationSource): string[] {
  if (source === 'NEQUI_CSV') return ['NEQUI'];
  // Bancolombia CSV puede traer transferencias y QR Bancolombia.
  return ['DAVIPLATA', 'QR_BANCOLOMBIA', 'TRANSFER'];
}

type SavedRowWithUser = PaymentReconciliation & {
  importedBy: Pick<User, 'fullName'> | null;
};

function toSavedDto(row: SavedRowWithUser): SavedReconciliation {
  return {
    id: row.id,
    source: row.source as ReconciliationSource,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    csvRowsParsed: row.csvRowsParsed,
    posSalesEvaluated: row.posSalesEvaluated,
    matched: row.matched,
    unmatchedCsv: row.unmatchedCsv,
    unmatchedSale: row.unmatchedSale,
    importedById: row.importedById,
    importedByName: row.importedBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
