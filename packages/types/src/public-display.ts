import { z } from 'zod';

// ====================================================================
// PUBLIC DISPLAY — pantalla pública para clientes (FASE 6.B)
// ====================================================================

export const PUBLIC_DISPLAY_NAMESPACE = '/public-display';

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
});
export type PublicDisplayOrder = z.infer<typeof PublicDisplayOrderSchema>;

export const PublicDisplayStateSchema = z.object({
  /** Última orden LISTO_DESPACHO de type=COUNTER en los últimos 30 min. */
  current: PublicDisplayOrderSchema.nullable(),
  /** Próximas 2 órdenes en cola (PAGADO o EN_PREPARACION) por paidAt asc. */
  next: z.array(PublicDisplayOrderSchema).max(3),
  /** Server timestamp del momento en que se construyó el snapshot. */
  asOf: z.string().datetime(),
});
export type PublicDisplayState = z.infer<typeof PublicDisplayStateSchema>;
