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

/** Proveedor histórico para una sugerencia: alguien que alguna vez vendió ese item. */
export const HistoricalSupplierSchema = z.object({
  supplierId: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  lastUnitPrice: z.number().nullable(),
  lastPurchaseDate: z.string().datetime().nullable(),
  /** El proveedor más reciente — viene marcado para sugerir como default en la UI. */
  isLast: z.boolean(),
});
export type HistoricalSupplier = z.infer<typeof HistoricalSupplierSchema>;

/** Body para armar el pedido a un proveedor. */
export const SendToSupplierSchema = z.object({
  supplierId: z.string().uuid(),
  /** Cantidad final a pedir (opcional; default = sugerencia). */
  quantity: z.number().positive().optional(),
  /** Día en que se quiere recibir (YYYY-MM-DD, hora local). */
  neededBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige una fecha válida para la entrega.')
    .optional(),
  /** Nota extra del usuario en el mensaje al proveedor. */
  note: z.string().max(500).optional(),
});
export type SendToSupplier = z.infer<typeof SendToSupplierSchema>;

/**
 * Pedido listo para abrir en WhatsApp. El sistema NO lo envía: arma el texto y
 * el link, y quien compra lo manda desde su propio WhatsApp (puede editarlo
 * antes). `url` es null cuando el proveedor no tiene teléfono cargado.
 */
export const SupplierOrderLinkSchema = z.object({
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  /** Teléfono en dígitos wa.me (`573001112233`). null ⇒ no hay chat que abrir. */
  phone: z.string().nullable(),
  url: z.string().url().nullable(),
  /** El mensaje sin encodear — se muestra como vista previa. */
  messagePlain: z.string(),
});
export type SupplierOrderLink = z.infer<typeof SupplierOrderLinkSchema>;

/** Resultado del envío de un pedido (o resumen) por WhatsApp. */
export const WhatsAppSendOutcomeSchema = z.object({
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  recipients: z.array(
    z.object({
      name: z.string(),
      phone: z.string(),
      status: z.enum(['sent', 'failed', 'skipped']),
      reason: z.string().optional(),
    }),
  ),
  preview: z.string(),
});
export type WhatsAppSendOutcome = z.infer<typeof WhatsAppSendOutcomeSchema>;

/** Resultado del cron de detección. */
export const ScanResultSchema = z.object({
  scannedAt: z.string().datetime(),
  scannedCount: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  staledCount: z.number().int().nonnegative(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
