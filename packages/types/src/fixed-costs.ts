import { z } from 'zod';

/** MENSUAL = se aplica tal cual cada mes; ANUAL = se prorratea ÷12 al mes. */
export const FixedCostFrequencyEnum = z.enum(['MONTHLY', 'ANNUAL']);
export type FixedCostFrequency = z.infer<typeof FixedCostFrequencyEnum>;

/** Categorías sugeridas (cliente puede igual escribir libre). */
export const FIXED_COST_CATEGORIES = [
  'Alquiler',
  'Servicios',
  'Software',
  'Profesionales',
  'Marketing',
  'Mantenimiento',
  'Impuestos',
  'Otros',
] as const;

export const FixedCostSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** En COP. */
  amount: z.number().nonnegative(),
  frequency: FixedCostFrequencyEnum,
  category: z.string(),
  /** YYYY-MM-DD (fecha-solo). */
  startedAt: z.string().nullable(),
  /** YYYY-MM-DD (fecha-solo). */
  endedAt: z.string().nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FixedCost = z.infer<typeof FixedCostSchema>;

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD');

export const CreateFixedCostSchema = z.object({
  name: z.string().min(1).max(120),
  amount: z.number().nonnegative(),
  frequency: FixedCostFrequencyEnum,
  category: z.string().min(1).max(60),
  startedAt: DateOnly.nullable().optional(),
  endedAt: DateOnly.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type CreateFixedCost = z.infer<typeof CreateFixedCostSchema>;

export const UpdateFixedCostSchema = CreateFixedCostSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateFixedCost = z.infer<typeof UpdateFixedCostSchema>;

// ====================================================================
// ESTADO FINANCIERO MENSUAL — P&G + break-even + tendencia
// ====================================================================

/** Una línea de costo fijo del mes (ya prorrateado si era anual). */
export const FixedCostLineSchema = z.object({
  fixedCostId: z.string().uuid().nullable(),
  name: z.string(),
  category: z.string(),
  /** Monto efectivo en el mes (anual ÷ 12 si frequency=ANNUAL). */
  monthlyAmount: z.number(),
  /** `true` si este renglón viene del módulo de Nómina (auto). */
  isPayroll: z.boolean(),
});
export type FixedCostLine = z.infer<typeof FixedCostLineSchema>;

export const MonthlyFinancialStatementSchema = z.object({
  year: z.number().int(),
  month: z.number().int(), // 1-12
  monthLabel: z.string(),
  periodStart: z.string(), // YYYY-MM-DD
  periodEnd: z.string(), // YYYY-MM-DD
  revenue: z.number(),
  cogs: z.number(),
  grossMargin: z.number(),
  /** grossMargin / revenue. 0 si revenue=0. */
  grossMarginPct: z.number(),
  fixedCosts: z.array(FixedCostLineSchema),
  totalFixed: z.number(),
  /** Costo (a COGS) de las cortesías AUTORIZADas dadas en el período. */
  cortesiasCost: z.number(),
  netResult: z.number(),
  /** Ventas necesarias para cubrir todo (≈ totalFixed / grossMarginPct). null si no se puede calcular. */
  breakEven: z.number().nullable(),
  /** revenue / breakEven (0..1+). null si no se puede. */
  breakEvenCoverage: z.number().nullable(),
});
export type MonthlyFinancialStatement = z.infer<typeof MonthlyFinancialStatementSchema>;

/** Resumen reducido de un mes para la tendencia. */
export const MonthlyTrendPointSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  monthLabel: z.string(),
  revenue: z.number(),
  cogs: z.number(),
  totalFixed: z.number(),
  netResult: z.number(),
});
export type MonthlyTrendPoint = z.infer<typeof MonthlyTrendPointSchema>;

export const MonthlyTrendSchema = z.object({
  points: z.array(MonthlyTrendPointSchema),
});
export type MonthlyTrend = z.infer<typeof MonthlyTrendSchema>;

// ====================================================================
// ANÁLISIS IA del estado financiero
// ====================================================================

export const FinancialAnalysisToneEnum = z.enum(['saludable', 'atencion', 'critico']);
export type FinancialAnalysisTone = z.infer<typeof FinancialAnalysisToneEnum>;

export const FinancialAnalysisBulletKindEnum = z.enum(['positivo', 'vigilar', 'accion']);
export type FinancialAnalysisBulletKind = z.infer<typeof FinancialAnalysisBulletKindEnum>;

export const FinancialAnalysisSchema = z.object({
  tono: FinancialAnalysisToneEnum,
  /** 1 oración resumen del mes. Concreta y con cifras. */
  titular: z.string(),
  /** 3-5 bullets de análisis (mix de positivos, alertas y acciones concretas). */
  bullets: z.array(
    z.object({
      tipo: FinancialAnalysisBulletKindEnum,
      texto: z.string(),
    }),
  ),
  /** 1 acción concreta sugerida para el próximo mes. */
  siguiente_paso: z.string(),
  modelUsed: z.string(),
  generatedAt: z.string().datetime(),
});
export type FinancialAnalysis = z.infer<typeof FinancialAnalysisSchema>;
