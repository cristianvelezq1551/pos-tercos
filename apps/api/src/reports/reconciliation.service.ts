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

    // PAGOS digitales del POS en el rango (con buffer ±24h de tolerancia).
    // La unidad de match es el PAGO (sale_payments), no la venta: una cuenta
    // dividida con 2 transferencias genera 2 abonos en el banco, cada uno
    // matchea contra su parte. El set de status cubre todo estado "cobrado"
    // (incluye LISTO_DESPACHO de los web y los EN_PREPARACION/ENTREGADO
    // históricos), no solo PAGADO.
    const bufferMs = TIME_TOLERANCE_HOURS * 60 * 60 * 1000;
    // Ventana del extracto en DÍAS CALENDARIO del negocio (TZ local del server):
    // las fechas date-only del CSV se parsean a medianoche UTC; comparar contra
    // `periodTo` crudo excluía toda venta de la tarde/noche del último día del
    // extracto — justo las que faltaban en el banco quedaban sin flag
    // (auditoría 2026-07-05). Se computa ACÁ para que el fetch de candidatos
    // cubra la ventana completa (en UTC-5, periodEndExcl > periodTo+24h; con el
    // buffer solo, las ventas de 19:00-24:00 del último día ni se cargaban).
    const localDayStart = (d: Date): Date =>
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const periodStart = localDayStart(periodFrom);
    const periodEndExcl = new Date(localDayStart(periodTo).getTime() + 24 * 60 * 60 * 1000);
    const fetchFrom = new Date(
      Math.min(periodFrom.getTime() - bufferMs, periodStart.getTime()),
    );
    const fetchTo = new Date(Math.max(periodTo.getTime() + bufferMs, periodEndExcl.getTime()));
    const compatibleMethods = methodsForSource(source);
    const paymentRows = await this.prisma.salePayment.findMany({
      where: {
        method: { in: compatibleMethods as Prisma.EnumPaymentMethodFilter['in'] },
        sale: {
          status: {
            in: [
              'PAGADO',
              'EN_PREPARACION',
              'LISTO_DESPACHO',
              'ENTREGADO',
              'CANCELADO_SIN_REEMBOLSO',
            ],
          },
          paidAt: {
            gte: fetchFrom,
            lte: fetchTo,
          },
        },
      },
      select: {
        id: true,
        method: true,
        amount: true,
        sale: { select: { id: true, receiptNumber: true, paidAt: true } },
      },
    });
    const candidates = paymentRows
      .map((pr) => ({
        paymentId: pr.id,
        saleId: pr.sale.id,
        receiptNumber: Number(pr.sale.receiptNumber),
        amount: Number(pr.amount),
        paidAt: pr.sale.paidAt,
        method: pr.method as string,
      }))
      .filter((c) => c.paidAt !== null)
      .sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime());

    // Greedy matching: para cada CSV row, buscar la primera sale candidata
    // que aún no esté tomada.
    const usedPaymentIds = new Set<string>();
    const rows: ReconciliationRow[] = [];

    for (const csv of csvRows) {
      let match: typeof candidates[number] | undefined;
      for (const cand of candidates) {
        if (usedPaymentIds.has(cand.paymentId)) continue;
        if (cand.amount !== csv.amount) continue;
        const dt = Math.abs(cand.paidAt!.getTime() - csv.date.getTime());
        if (dt > bufferMs) continue;
        match = cand;
        break;
      }
      if (match) {
        usedPaymentIds.add(match.paymentId);
        rows.push({
          status: 'matched',
          csvDate: csv.date.toISOString(),
          csvAmount: csv.amount,
          csvReference: csv.reference,
          saleId: match.saleId,
          receiptNumber: match.receiptNumber,
          // En cuentas divididas es el monto de ESA parte (lo que ve el banco).
          saleTotal: match.amount,
          salePaidAt: match.paidAt!.toISOString(),
          paymentMethod: match.method as ReconciliationRow['paymentMethod'],
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

    // Pagos digitales del POS sin match en el CSV, dentro de la ventana de
    // días calendario computada arriba (los candidatos del buffer extra solo
    // participan del matching, no del flag).
    for (const cand of candidates) {
      if (usedPaymentIds.has(cand.paymentId)) continue;
      // Solo consideramos sin-match los que estén EN el periodo CSV (no en el buffer).
      if (cand.paidAt! < periodStart || cand.paidAt! >= periodEndExcl) continue;
      rows.push({
        status: 'unmatched_sale',
        csvDate: null,
        csvAmount: null,
        csvReference: null,
        saleId: cand.saleId,
        receiptNumber: cand.receiptNumber,
        saleTotal: cand.amount,
        salePaidAt: cand.paidAt!.toISOString(),
        paymentMethod: cand.method as ReconciliationRow['paymentMethod'],
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
      posSalesEvaluated: candidates.length,
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
