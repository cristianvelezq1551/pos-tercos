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
