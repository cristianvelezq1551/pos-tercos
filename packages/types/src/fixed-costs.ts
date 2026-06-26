import { z } from 'zod';

/**
 * MENSUAL = se aplica tal cual cada mes; ANUAL = se prorratea ÷12 al mes;
 * PUNTUAL (ONE_TIME) = gasto único (ej. reparación), cuenta una vez en el mes
 * de su fecha (`startedAt`).
 */
export const FixedCostFrequencyEnum = z.enum(['MONTHLY', 'ANNUAL', 'ONE_TIME']);
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

const FixedCostBaseSchema = z.object({
  name: z.string().min(1).max(120),
  amount: z.number().nonnegative(),
  frequency: FixedCostFrequencyEnum,
  category: z.string().min(1).max(60),
  startedAt: DateOnly.nullable().optional(),
  endedAt: DateOnly.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

/** Un gasto puntual necesita la fecha (define en qué mes pega al P&G). */
const requireDateForOneTime = (
  v: { frequency: FixedCostFrequency; startedAt?: string | null },
  ctx: z.RefinementCtx,
): void => {
  if (v.frequency === 'ONE_TIME' && !v.startedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['startedAt'],
      message: 'Un gasto puntual requiere la fecha del gasto.',
    });
  }
};

export const CreateFixedCostSchema = FixedCostBaseSchema.superRefine(requireDateForOneTime);
export type CreateFixedCost = z.infer<typeof CreateFixedCostSchema>;

export const UpdateFixedCostSchema = FixedCostBaseSchema.partial()
  .extend({ isActive: z.boolean().optional() })
  .superRefine((v, ctx) => {
    if (v.frequency !== undefined) requireDateForOneTime(v as never, ctx);
  });
export type UpdateFixedCost = z.infer<typeof UpdateFixedCostSchema>;

// ====================================================================
// ESTADO FINANCIERO MENSUAL — P&G + break-even + tendencia
// ====================================================================

/** Una línea de costo/gasto del mes (ya prorrateado si era anual). */
export const FixedCostLineSchema = z.object({
  fixedCostId: z.string().uuid().nullable(),
  name: z.string(),
  category: z.string(),
  /** Monto efectivo en el mes (anual ÷ 12 si frequency=ANNUAL). */
  monthlyAmount: z.number(),
  /** `true` si este renglón viene del módulo de Nómina (auto). */
  isPayroll: z.boolean(),
  /** `true` si es un gasto PUNTUAL (no recurrente) → grupo aparte en el P&G. */
  isOneTime: z.boolean(),
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
  /** Costos/gastos del mes (recurrentes + puntuales); separá por `isOneTime`. */
  fixedCosts: z.array(FixedCostLineSchema),
  /** Total de costos RECURRENTES (nómina + mensuales/anuales). Sin puntuales. */
  totalFixed: z.number(),
  /** Total de gastos PUNTUALES/excepcionales del mes (reparaciones, etc.). */
  oneTimeCost: z.number(),
  /** Costo (a COGS FIFO) de las cortesías autorizadas dadas en el período. */
  cortesiasCost: z.number(),
  /** true si alguna cortesía se valuó sin lote FIFO disponible → la pérdida real
   *  por cortesías puede estar subestimada (mostrar aviso). */
  cortesiasCostPartial: z.boolean(),
  /** Costo (a COGS FIFO) de los pedidos reembolsados en el período: la comida se
   *  preparó pero se devolvió la plata → pérdida real que baja el neto. */
  refundCost: z.number(),
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
