import { z } from 'zod';

// ====================================================================
// PUBLIC DISPLAY — pantalla pública para clientes (FASE 6.B)
// ====================================================================

export const PUBLIC_DISPLAY_NAMESPACE = '/public-display';

/**
 * Item visible en la pantalla pública. Subset SAFE de SaleItem + Product:
 * solo nombre, imagen y cantidad. NUNCA precio, modifiers ni totals — la
 * pantalla es visible al público.
 */
export const PublicDisplayOrderItemSchema = z.object({
  productName: z.string().min(1).max(120),
  imageUrl: z.string().max(500).nullable(),
  quantity: z.number().int().positive(),
});
export type PublicDisplayOrderItem = z.infer<typeof PublicDisplayOrderItemSchema>;

/**
 * Datos seguros de exponer a una pantalla SIN autenticación. NO incluye
 * payment, total, customerPhone, etc. — solo lo mínimo para mostrar al
 * cliente "tu turno está listo".
 */
export const PublicDisplayOrderSchema = z.object({
  saleId: z.string().uuid(),
  receiptNumber: z.number().int().positive(),
  customerName: z.string().nullable(),
  /** ISO datetime del momento en que pasó al estado actual. */
  at: z.string().datetime(),
  /** Hasta 4 items para el thumb stack visual. Resto se omite. */
  items: z.array(PublicDisplayOrderItemSchema).max(4),
});
export type PublicDisplayOrder = z.infer<typeof PublicDisplayOrderSchema>;

export const PublicDisplayStateSchema = z.object({
  /** Última orden LISTO_DESPACHO de type=COUNTER en los últimos 30 min. */
  current: PublicDisplayOrderSchema.nullable(),
  /** Próximas 2 órdenes en cola (PAGADO o EN_PREPARACION) por paidAt asc. */
  next: z.array(PublicDisplayOrderSchema).max(3),
  /** Server timestamp del momento en que se construyó el snapshot. */
  asOf: z.string().datetime(),
  /** Número de turno actual visible en pantalla (lo controla el cajero). */
  currentTurn: z.number().int().min(1).max(9999),
});
export type PublicDisplayState = z.infer<typeof PublicDisplayStateSchema>;

export const SetTurnSchema = z.object({
  value: z.number().int().min(1).max(9999),
});
export type SetTurn = z.infer<typeof SetTurnSchema>;

export const TurnResponseSchema = z.object({
  currentTurn: z.number().int().min(1).max(9999),
});
export type TurnResponse = z.infer<typeof TurnResponseSchema>;
