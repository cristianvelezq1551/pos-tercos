import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ReconciliationReport,
  ReconciliationRow,
  ReconciliationSource,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Tolerancia para considerar match temporal: ±N horas entre CSV y sale.paidAt. */
const TIME_TOLERANCE_HOURS = 24;

interface CsvRow {
  date: Date;
  amount: number;
  reference: string;
}

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

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
    const csvRows = this.parseCsv(source, csvText);
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

  /**
   * Parser CSV minimalista. Asume formato:
   *  - Header en línea 1.
   *  - Columnas: fecha, monto, referencia (en ese orden, separadas por `,`).
   *  - Fechas ISO o YYYY-MM-DD.
   *
   * Para CSVs reales de Nequi/Bancolombia este parser hay que extenderlo
   * por proveedor (delimitadores, columnas, encoding) — FASE 14 hardening.
   */
  private parseCsv(source: ReconciliationSource, text: string): CsvRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) return [];
    const rows: CsvRow[] = [];
    // Skip header (line 0). Parse desde línea 1.
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) continue;
      const date = new Date(cols[0]!);
      const amount = Number(cols[1]!.replace(/[^\d.-]/g, ''));
      const reference = cols[2] ?? '';
      if (Number.isNaN(date.getTime()) || !Number.isFinite(amount)) continue;
      rows.push({ date, amount, reference });
    }
    void source; // kept for future per-source parsing
    return rows;
  }
}

function methodsForSource(source: ReconciliationSource): string[] {
  if (source === 'NEQUI_CSV') return ['NEQUI'];
  // Bancolombia CSV puede traer transferencias y QR Bancolombia.
  return ['DAVIPLATA', 'QR_BANCOLOMBIA', 'TRANSFER'];
}
