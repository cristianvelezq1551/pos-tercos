import { z } from 'zod';
import { SaleSchema } from './sales';

// ====================================================================
// KITCHEN ORDER — proyección de Sale para el KDS (FASE 6)
// ====================================================================

/**
 * Estados que entran al KDS:
 *  - PAGADO          → en cola, esperando que cocinero le dé "Iniciar"
 *  - EN_PREPARACION  → en preparación, esperando "Listo"
 * Estados que salen del KDS:
 *  - LISTO_DESPACHO  → ya está listo (mostrador entrega o repa lo retira)
 *  - VOID            → anulada (no debe aparecer)
 */
export const KitchenStatusEnum = z.enum(['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO']);
export type KitchenStatus = z.infer<typeof KitchenStatusEnum>;

/**
 * Lo que el KDS necesita para renderizar una orden — wire idéntico al
 * Sale completo (incluye items + receipt#) para no duplicar shape, pero
 * el KDS solo consume {id, receiptNumber, type, status, items, paidAt}.
 */
export const KitchenOrderSchema = SaleSchema;
export type KitchenOrder = z.infer<typeof KitchenOrderSchema>;

// ====================================================================
// KDS WEBSOCKET EVENTS
// ====================================================================

export const KDS_NAMESPACE = '/ws/kds';
export const KDS_QUEUE_ROOM = 'kitchen.queue';

export const KdsEventNameEnum = z.enum([
  'order.created', // sale recién PAGADO entra al queue
  'order.status.changed', // PAGADO → EN_PREPARACION → LISTO_DESPACHO o VOID (sale del queue)
]);
export type KdsEventName = z.infer<typeof KdsEventNameEnum>;

export const KdsEventSchema = z.object({
  event: KdsEventNameEnum,
  sale: KitchenOrderSchema,
  /** ISO datetime del momento del emit (no del cambio en DB). */
  emittedAt: z.string().datetime(),
});
export type KdsEvent = z.infer<typeof KdsEventSchema>;
