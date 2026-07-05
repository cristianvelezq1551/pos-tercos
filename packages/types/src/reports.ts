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

/**
 * Snapshot persistido de un report (FASE 14.D). Histórico inmutable —
 * cada import del dueño deja una fila para que pueda comparar a lo
 * largo del tiempo.
 */
export const SavedReconciliationSchema = z.object({
  id: z.string().uuid(),
  source: ReconciliationSourceEnum,
  periodFrom: z.string(),
  periodTo: z.string(),
  csvRowsParsed: z.number().int().nonnegative(),
  posSalesEvaluated: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  unmatchedCsv: z.number().int().nonnegative(),
  unmatchedSale: z.number().int().nonnegative(),
  importedById: z.string().uuid().nullable(),
  importedByName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type SavedReconciliation = z.infer<typeof SavedReconciliationSchema>;

/** Detalle: SavedReconciliation + reportJson completo. */
export const SavedReconciliationDetailSchema = SavedReconciliationSchema.extend({
  report: ReconciliationReportSchema,
});
export type SavedReconciliationDetail = z.infer<
  typeof SavedReconciliationDetailSchema
>;

// ====================================================================
// SALES REPORTS (FASE 13.A)
// ====================================================================
// Filtros base: from/to (ISO date YYYY-MM-DD), opcional cashierId/shiftId.
// Granularidad: daily (por defecto). Devolvemos una serie temporal +
// breakdowns + totales para que el frontend renderice dashboard, gráfica
// y tabla del mismo payload.
// ====================================================================

export const SalesGranularityEnum = z.enum(['daily', 'hourly']);
export type SalesGranularity = z.infer<typeof SalesGranularityEnum>;

export const SalesBucketSchema = z.object({
  /** ISO date `YYYY-MM-DD` (daily) o ISO datetime hora exacta (hourly). */
  bucket: z.string(),
  count: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
  discount: z.number().nonnegative(),
});
export type SalesBucket = z.infer<typeof SalesBucketSchema>;

export const SalesByTypeSchema = z.object({
  type: z.enum(['COUNTER', 'WEB_PICKUP']),
  count: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
});
export type SalesByType = z.infer<typeof SalesByTypeSchema>;

export const SalesByMethodSchema = z.object({
  method: z.enum(['CASH', 'NEQUI', 'DAVIPLATA', 'QR_BANCOLOMBIA', 'TRANSFER']),
  count: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
});
export type SalesByMethod = z.infer<typeof SalesByMethodSchema>;

export const SalesSummarySchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  granularity: SalesGranularityEnum,
  totals: z.object({
    count: z.number().int().nonnegative(),
    revenue: z.number().nonnegative(),
    discount: z.number().nonnegative(),
    voidCount: z.number().int().nonnegative(),
    avgTicket: z.number().nonnegative(),
  }),
  buckets: z.array(SalesBucketSchema),
  byType: z.array(SalesByTypeSchema),
  byMethod: z.array(SalesByMethodSchema),
});
export type SalesSummary = z.infer<typeof SalesSummarySchema>;

// ====================================================================
// TOP PRODUCTS (FASE 13.A)
// ====================================================================

export const TopProductSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  quantity: z.number().nonnegative(),
  revenue: z.number().nonnegative(),
  /** Costo total estimado (sumatoria de lastUnitCost × qty consumida). null si no se pudo calcular. */
  estCost: z.number().nullable(),
  /** Margen absoluto = revenue - estCost. null si no se pudo calcular. */
  estMargin: z.number().nullable(),
  /** % margin = estMargin / revenue. null si no se pudo calcular. */
  estMarginPct: z.number().nullable(),
});
export type TopProduct = z.infer<typeof TopProductSchema>;

export const TopProductsReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  products: z.array(TopProductSchema),
});
export type TopProductsReport = z.infer<typeof TopProductsReportSchema>;

// ====================================================================
// HOUR HEATMAP (FASE 13.A) — día de semana × hora del día
// ====================================================================

export const HourHeatmapCellSchema = z.object({
  /** 0=domingo … 6=sábado (JS Date.getDay convention). */
  dow: z.number().int().min(0).max(6),
  /** 0..23 (hora local Bogotá). */
  hour: z.number().int().min(0).max(23),
  count: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
});
export type HourHeatmapCell = z.infer<typeof HourHeatmapCellSchema>;

export const HourHeatmapReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  cells: z.array(HourHeatmapCellSchema),
});
export type HourHeatmapReport = z.infer<typeof HourHeatmapReportSchema>;

// ====================================================================
// WHATSAPP METRICS — cobertura por stage desde tabla whatsapp_messages (v2/OpenWA)
// ====================================================================

export const WhatsAppStageCoverageSchema = z.object({
  stage: z.enum(['payment_instructions', 'payment_received', 'pickup_ready']),
  /** Cantidad de sales web elegibles para este stage en el período. */
  eligible: z.number().int().nonnegative(),
  /** Cantidad de sales con al menos 1 mensaje OpenWA enviado (status=sent). */
  reached: z.number().int().nonnegative(),
  /** % cobertura = reached / eligible. 0..1. null si eligible=0. */
  coveragePct: z.number().nullable(),
});
export type WhatsAppStageCoverage = z.infer<typeof WhatsAppStageCoverageSchema>;

export const WhatsAppMetricsSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  totalWebSales: z.number().int().nonnegative(),
  stages: z.array(WhatsAppStageCoverageSchema),
});
export type WhatsAppMetrics = z.infer<typeof WhatsAppMetricsSchema>;

// ====================================================================
// IA SUGGESTIONS METRICS (FASE 13.A) — desde purchase_suggestions
// ====================================================================

export const SuggestionsMetricsSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  byStatus: z.object({
    pending: z.number().int().nonnegative(),
    evaluated: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
  }),
  evaluatedCount: z.number().int().nonnegative(),
  /** Total estimado en COP de las suggestions ACEPTADAS. */
  acceptedEstTotal: z.number().nonnegative(),
});
export type SuggestionsMetrics = z.infer<typeof SuggestionsMetricsSchema>;

// ====================================================================
// DASHBOARD HOME (FASE 13.B) — resumen del día
// ====================================================================

export const DashboardSummarySchema = z.object({
  /** Fecha del día (YYYY-MM-DD, zona Bogotá). */
  date: z.string(),
  todayCount: z.number().int().nonnegative(),
  todayRevenue: z.number().nonnegative(),
  todayDiscount: z.number().nonnegative(),
  /** Diferencia % vs el mismo día de la semana pasada. null si no hay sample. */
  weekOverWeekPct: z.number().nullable(),
  /** Pedidos web pendientes de pago en el momento de la consulta. */
  pendingWebOrders: z.number().int().nonnegative(),
  /** Pedidos web pagados que el cajero aún no marcó "listo para retirar". */
  webOrdersToPrepare: z.number().int().nonnegative(),
  /** Pedidos web marcados "listos para retirar" hoy. */
  webOrdersReady: z.number().int().nonnegative(),
  /** Stockables bajo threshold (ingredient/product directResale activos). */
  lowStockCount: z.number().int().nonnegative(),
  pendingSuggestions: z.number().int().nonnegative(),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

// ====================================================================
// RESUMEN / ANÁLISIS CON IA (texto en lenguaje natural)
// ====================================================================

export const AiSummarySchema = z.object({
  /** Texto generado por la IA (español). */
  text: z.string(),
  /** Modelo usado, ej. "anthropic:claude-haiku-4-5". */
  modelUsed: z.string(),
  generatedAt: z.string().datetime(),
});
export type AiSummary = z.infer<typeof AiSummarySchema>;

// ====================================================================
// USO Y MERMAS DE INVENTARIO — consumo teórico (ventas/producción) vs
// pérdidas declaradas (WASTE) y ajustes de conteo físico
// ====================================================================

export const InventoryUsageRowSchema = z.object({
  entityType: z.enum(['INGREDIENT', 'PRODUCT', 'SUBPRODUCT']),
  entityId: z.string().uuid(),
  name: z.string(),
  /** Unidad de stock/receta en la que están las cantidades. */
  unit: z.string(),
  /** Consumido por ventas en el período (neto de anulaciones). Positivo. */
  sales: z.number(),
  /** Consumido como insumo de producciones de subproductos. Positivo. */
  productionOut: z.number(),
  /** Producido (entradas por PRODUCTION — solo subproductos). Positivo. */
  productionIn: z.number(),
  /** Entradas por compras confirmadas. Positivo. */
  purchased: z.number(),
  /** Mermas declaradas (movements WASTE). Positivo = cantidad perdida. */
  waste: z.number(),
  /** Ajustes manuales netos (+ sobra detectada / − faltante detectado). */
  adjustments: z.number(),
  /** waste / (sales + productionOut + waste). Null si no hubo consumo. */
  wastePct: z.number().nullable(),
  /** Costo estimado por unidad (lastUnitCost/conversionFactor). Null si no se conoce. */
  unitCost: z.number().nullable(),
  /** $ estimado perdido = (waste + faltante de ajustes) × unitCost. */
  wasteCost: z.number().nullable(),
});
export type InventoryUsageRow = z.infer<typeof InventoryUsageRowSchema>;

export const InventoryUsageReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  rows: z.array(InventoryUsageRowSchema),
  /** Suma de wasteCost conocidos. */
  totalWasteCost: z.number(),
  /** Filas cuyo costo no se pudo estimar (sin lastUnitCost). */
  unknownCostCount: z.number().int().nonnegative(),
});
export type InventoryUsageReport = z.infer<typeof InventoryUsageReportSchema>;

// ====================================================================
// LOTES FIFO RESTANTES — para mostrar "tu inventario rinde N porciones a $X"
// en el editor de receta. Solo lectura; no afecta el costeo.
// ====================================================================

export const FifoLotSchema = z.object({
  qty: z.number(),
  /** Costo por unidad base del lote. Null = lote sin costo conocido. */
  unitCost: z.number().nullable(),
});
export type FifoLot = z.infer<typeof FifoLotSchema>;

export const FifoEntityLotsSchema = z.object({
  entityType: z.enum(['INGREDIENT', 'PRODUCT', 'SUBPRODUCT']),
  entityId: z.string().uuid(),
  /** Lotes en orden FIFO: el más viejo (que se consume primero) primero. */
  lots: z.array(FifoLotSchema),
});
export type FifoEntityLots = z.infer<typeof FifoEntityLotsSchema>;

export const FifoLotsResponseSchema = z.object({
  entities: z.array(FifoEntityLotsSchema),
});
export type FifoLotsResponse = z.infer<typeof FifoLotsResponseSchema>;
