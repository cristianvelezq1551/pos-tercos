import { z } from 'zod';

// ====================================================================
// COCKPIT FINANCIERO (cash-based) — qué entró, qué pagué, qué debo.
//
// Esto NO es el P&G accrual del FinancialReportsService (ese está en
// /reports/financial/monthly y resta COGS FIFO + costos fijos). Esto es
// la vista de tesorería que responde 3 preguntas:
//   - ¿Cuánto vendí este mes? (revenue por paidAt)
//   - ¿Cuánto pagué este mes? (egresos con paidAt/resolvedAt en el mes)
//   - ¿Cuánto debo todavía? (suma global de pendientes, incluyendo
//     períodos anteriores no pagados — para no esconder deuda vieja)
// ====================================================================

/** Suma de plata que sale, partida por categoría. */
export const FinanceMoneyFlowSchema = z.object({
  payroll: z.number(),
  invoices: z.number(),
  fixedCosts: z.number(),
  /** Compromisos por pagar (deudas puntuales a terceros). */
  payables: z.number(),
  total: z.number(),
});
export type FinanceMoneyFlow = z.infer<typeof FinanceMoneyFlowSchema>;

/** Compromiso por pagar pendiente (deuda a un tercero). */
export const FinancePendingPayableSchema = z.object({
  id: z.string().uuid(),
  beneficiary: z.string(),
  description: z.string(),
  amount: z.number(),
});
export type FinancePendingPayable = z.infer<typeof FinancePendingPayableSchema>;

/** Compromiso por pagar ya pagado este mes. */
export const FinancePaidPayableSchema = z.object({
  id: z.string().uuid(),
  beneficiary: z.string(),
  description: z.string(),
  amount: z.number(),
  paidAt: z.string().datetime(),
  hasProof: z.boolean(),
});
export type FinancePaidPayable = z.infer<typeof FinancePaidPayableSchema>;

/** Línea de un sub-pago de nómina pendiente por pagar. */
export const FinancePendingPayrollSchema = z.object({
  userId: z.string().uuid(),
  userName: z.string(),
  periodStart: z.string(), // YYYY-MM-DD
  /** Ej: "Parte 1 · 1–7 may 2026 · Quincena 1" */
  periodLabel: z.string(),
  total: z.number(),
  /** Semana EN CURSO: `total` es lo devengado hasta `accruedThrough`, no la
   *  semana completa. Las semanas cerradas no traen estos campos. */
  inProgress: z.boolean().optional(),
  accruedThrough: z.string().optional(), // YYYY-MM-DD
});
export type FinancePendingPayroll = z.infer<typeof FinancePendingPayrollSchema>;

/** Factura de proveedor pendiente de pago. */
export const FinancePendingInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  total: z.number(),
  /** Cuándo se confirmó la factura — sirve para priorizar las más viejas. */
  confirmedAt: z.string().datetime().nullable(),
});
export type FinancePendingInvoice = z.infer<typeof FinancePendingInvoiceSchema>;

/** Sub-pago de nómina ya pagado (con o sin comprobante visible). */
export const FinancePaidPayrollSchema = z.object({
  paymentId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string(),
  periodStart: z.string(),
  periodLabel: z.string(),
  amount: z.number(),
  paidAt: z.string().datetime(),
  hasProof: z.boolean(),
});
export type FinancePaidPayroll = z.infer<typeof FinancePaidPayrollSchema>;

/** Factura pagada. */
export const FinancePaidInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  total: z.number(),
  paidAt: z.string().datetime(),
  hasProof: z.boolean(),
});
export type FinancePaidInvoice = z.infer<typeof FinancePaidInvoiceSchema>;

/** Costo fijo (arriendo, servicios, etc) pendiente de pago en un período. */
export const FinancePendingFixedCostSchema = z.object({
  fixedCostId: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  periodYear: z.number().int(),
  periodMonth: z.number().int().min(1).max(12),
  /** Ej: "Arriendo · mayo 2026" */
  periodLabel: z.string(),
  /** Monto esperado (snapshot del monthlyAmount del fixed_cost). */
  amount: z.number(),
});
export type FinancePendingFixedCost = z.infer<typeof FinancePendingFixedCostSchema>;

/** Costo fijo ya pagado. */
export const FinancePaidFixedCostSchema = z.object({
  paymentId: z.string().uuid(),
  fixedCostId: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  periodYear: z.number().int(),
  periodMonth: z.number().int().min(1).max(12),
  periodLabel: z.string(),
  amount: z.number(),
  paidAt: z.string().datetime(),
  hasProof: z.boolean(),
});
export type FinancePaidFixedCost = z.infer<typeof FinancePaidFixedCostSchema>;

/** Body multipart para marcar pagado un costo fijo de un período. */
export const MarkFixedCostPaidSchema = z.object({
  periodYear: z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  /** Opcional: si no se envía, NOW(). YYYY-MM-DD. */
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD')
    .optional(),
  /** Opcional: override del monto (default = monthlyAmount del costo). */
  amount: z.number().nonnegative().optional(),
  note: z.string().max(500).optional(),
});
export type MarkFixedCostPaid = z.infer<typeof MarkFixedCostPaidSchema>;

/** Resumen financiero de un mes calendario. */
export const FinanceSummarySchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  /** "mayo 2026" */
  monthLabel: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),

  /** Ventas pagadas (paidAt) en el mes. */
  revenue: z.number(),
  /** Egresos pagados en el mes (paidAt/resolvedAt en rango). */
  paid: FinanceMoneyFlowSchema,
  /** Deuda total agnóstica del mes — incluye pendientes viejos para no
   *  esconder lo que se atrasó. */
  pending: FinanceMoneyFlowSchema,
  /** revenue - paid.total. NO incluye lo pendiente. */
  netCash: z.number(),

  /** Detalle (ordenado por más viejo primero para nómina y por
   *  confirmedAt asc para facturas — los pendientes más viejos arriba). */
  pendingPayroll: z.array(FinancePendingPayrollSchema),
  pendingInvoices: z.array(FinancePendingInvoiceSchema),
  pendingFixedCosts: z.array(FinancePendingFixedCostSchema),
  pendingPayables: z.array(FinancePendingPayableSchema),
  /** Detalle de lo pagado este mes (ordenado por paidAt DESC). */
  paidPayroll: z.array(FinancePaidPayrollSchema),
  paidInvoices: z.array(FinancePaidInvoiceSchema),
  paidFixedCosts: z.array(FinancePaidFixedCostSchema),
  paidPayables: z.array(FinancePaidPayableSchema),
});
export type FinanceSummary = z.infer<typeof FinanceSummarySchema>;
