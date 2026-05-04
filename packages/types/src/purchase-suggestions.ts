import { z } from 'zod';
import { StockableTypeEnum } from './inventory';

// ====================================================================
// PURCHASE SUGGESTION (FASE 12.C)
// ====================================================================
// Sugerencia automática de compra. Generada por cron horario que detecta
// stockables con stock por debajo del threshold_min. Análisis LLM (12.D)
// agrega rationale + model usado.
// ====================================================================

export const PurchaseSuggestionStatusEnum = z.enum([
  'PENDING',
  'EVALUATED',
  'ACCEPTED',
  'REJECTED',
  'STALE',
]);
export type PurchaseSuggestionStatus = z.infer<
  typeof PurchaseSuggestionStatusEnum
>;

export const PurchaseSuggestionSchema = z.object({
  id: z.string().uuid(),
  entityType: StockableTypeEnum,
  ingredientId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  /** Snapshot del nombre + unidad al momento de la sugerencia. */
  entityName: z.string(),
  unitPurchase: z.string(),
  currentStock: z.number(),
  thresholdMin: z.number(),
  suggestedQty: z.number().positive(),
  estUnitCost: z.number().nullable(),
  estTotal: z.number().nullable(),
  llmRationale: z.string().nullable(),
  llmModel: z.string().nullable(),
  llmEvaluatedAt: z.string().datetime().nullable(),
  status: PurchaseSuggestionStatusEnum,
  resolvedById: z.string().uuid().nullable(),
  resolvedByName: z.string().nullable().optional(),
  resolvedAt: z.string().datetime().nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PurchaseSuggestion = z.infer<typeof PurchaseSuggestionSchema>;

/** Body para POST /:id/accept y /:id/reject. */
export const ResolveSuggestionSchema = z.object({
  /** Nota libre del Dueño (opcional). Ej. "ya pedí por whatsapp", "espero a viernes". */
  note: z.string().max(500).optional(),
});
export type ResolveSuggestion = z.infer<typeof ResolveSuggestionSchema>;

/** Resultado del cron de detección. */
export const ScanResultSchema = z.object({
  scannedAt: z.string().datetime(),
  scannedCount: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  staledCount: z.number().int().nonnegative(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
