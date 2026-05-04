import { z } from 'zod';

// ====================================================================
// REPORTS — anomalías por cajero (FASE 11.D)
// ====================================================================

export const ShiftAnomalyFlagEnum = z.enum([
  'diff_high', // |difference| > baseline.avgDiff + 2σ
  'voids_high', // voidCount > baseline.avgVoids + 2σ
  'noSale_high', // noSaleCount > baseline.avgNoSale + 2σ
]);
export type ShiftAnomalyFlag = z.infer<typeof ShiftAnomalyFlagEnum>;

export const ShiftMetricsSchema = z.object({
  shiftId: z.string().uuid(),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  difference: z.number().nullable(),
  voidCount: z.number().int().nonnegative(),
  noSaleCount: z.number().int().nonnegative(),
  /** Flags marcadas si el valor está > mean + 2σ del baseline personal. */
  flags: z.array(ShiftAnomalyFlagEnum),
});
export type ShiftMetrics = z.infer<typeof ShiftMetricsSchema>;

export const CashierBaselineSchema = z.object({
  /** Cantidad de shifts usados para calcular avg/std. */
  sampleSize: z.number().int().nonnegative(),
  avgDiff: z.number(),
  stdDiff: z.number(),
  avgVoids: z.number(),
  stdVoids: z.number(),
  avgNoSale: z.number(),
  stdNoSale: z.number(),
});
export type CashierBaseline = z.infer<typeof CashierBaselineSchema>;

export const CashierAnomaliesSchema = z.object({
  cashierId: z.string().uuid(),
  cashierName: z.string().nullable(),
  totalShifts: z.number().int().nonnegative(),
  /** Baseline calculado desde shifts.slice(0, -1). null si <5 shifts (insuficiente). */
  baseline: CashierBaselineSchema.nullable(),
  /** Últimos 30 shifts del cajero, ordenados por openedAt desc. */
  shifts: z.array(ShiftMetricsSchema),
});
export type CashierAnomalies = z.infer<typeof CashierAnomaliesSchema>;

// ====================================================================
// PAYMENT RECONCILIATION (FASE 11.E) — stateless por ahora
// ====================================================================

export const ReconciliationSourceEnum = z.enum(['NEQUI_CSV', 'BANCOLOMBIA_CSV']);
export type ReconciliationSource = z.infer<typeof ReconciliationSourceEnum>;

export const ReconciliationMatchStatusEnum = z.enum([
  'matched', // CSV row + sale POS coinciden
  'unmatched_csv', // CSV tiene txn sin sale correspondiente — RED FLAG
  'unmatched_sale', // sale POS digital sin txn CSV — falta confirmación
]);
export type ReconciliationMatchStatus = z.infer<typeof ReconciliationMatchStatusEnum>;

export const ReconciliationRowSchema = z.object({
  status: ReconciliationMatchStatusEnum,
  /** Datos del CSV (null si unmatched_sale). */
  csvDate: z.string().nullable(),
  csvAmount: z.number().nullable(),
  csvReference: z.string().nullable(),
  /** Datos de la sale POS (null si unmatched_csv). */
  saleId: z.string().uuid().nullable(),
  receiptNumber: z.number().int().positive().nullable(),
  saleTotal: z.number().nullable(),
  salePaidAt: z.string().datetime().nullable(),
  paymentMethod: z.string().nullable(),
});
export type ReconciliationRow = z.infer<typeof ReconciliationRowSchema>;

export const ReconciliationReportSchema = z.object({
  source: ReconciliationSourceEnum,
  periodFrom: z.string(),
  periodTo: z.string(),
  csvRowsParsed: z.number().int().nonnegative(),
  posSalesEvaluated: z.number().int().nonnegative(),
  summary: z.object({
    matched: z.number().int().nonnegative(),
    unmatchedCsv: z.number().int().nonnegative(),
    unmatchedSale: z.number().int().nonnegative(),
  }),
  rows: z.array(ReconciliationRowSchema),
});
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;
