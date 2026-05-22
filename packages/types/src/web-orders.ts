import { z } from 'zod';
import { CreateSaleItemSchema } from './sales';

// ====================================================================
// WEB ORDER — pedido público desde apps/web (FASE 7)
// ====================================================================

/** Solo WEB_PICKUP (recoger en local). COUNTER viene del POS. */
export const WebOrderTypeEnum = z.enum(['WEB_PICKUP']);
export type WebOrderType = z.infer<typeof WebOrderTypeEnum>;

/**
 * Payload de POST /web/orders. Cliente NO autenticado. Backend recalcula
 * subtotal/discount/total contra catálogo + motor de promociones (no
 * confía en lo que llega del browser).
 *
 * Reglas:
 *  - WEB_PICKUP requiere customerName + customerPhone (solo recoger en local).
 *  - phone: ^\+57\d{10}$ (Colombia E.164 sin espacios). Backend rechaza otros.
 */
const PhoneSchema = z
  .string()
  .regex(/^\+57\d{10}$/, 'phone debe ser E.164 colombiano (+57XXXXXXXXXX)');

export const CreateWebOrderSchema = z
  .object({
    type: WebOrderTypeEnum,
    items: z.array(CreateSaleItemSchema).min(1).max(20),
    customerName: z.string().min(1).max(120),
    customerPhone: PhoneSchema,
    notes: z.string().max(500).optional(),
  });
export type CreateWebOrder = z.infer<typeof CreateWebOrderSchema>;

// ====================================================================
// WEB ORDER RESPONSE
// ====================================================================

/**
 * Lo que ve el cliente tras crear o consultar la orden. Subset
 * intencional: sin paymentMethod (el cajero lo elige al confirmar),
 * sin cashier, sin shift. Sí incluye total + status + payment
 * instructions opacas.
 */
export const PublicWebOrderSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.number().int().positive(),
  type: WebOrderTypeEnum,
  status: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});
export type PublicWebOrder = z.infer<typeof PublicWebOrderSchema>;

export const CreateWebOrderResponseSchema = z.object({
  order: PublicWebOrderSchema,
  /** Token HMAC firmado para consultar la orden vía GET /web/orders/:id?token=. */
  token: z.string(),
  /** Caduca: 24h desde createdAt. */
  tokenExpiresAt: z.string().datetime(),
  /** Texto opaco con instrucciones (Nequi, transferencia, etc.). Configurable
   *  vía env vars — el backend NO conoce el valor canónico, solo lo formatea. */
  paymentInstructions: z.string(),
});
export type CreateWebOrderResponse = z.infer<typeof CreateWebOrderResponseSchema>;

// ====================================================================
// WS POS NOTIFICATION (FASE 7.B + 7.E + 14.A cleanup)
// ====================================================================
// `web-order.customer-paid` removido en 14.A (era parte del flujo "Ya pagué"
// del cliente que se eliminó en 9.D). El backend ya no emite ese evento.
// `web-order.cancelled` queda como reserva — sin emitter por ahora.

export const POS_NAMESPACE = '/ws/pos';
export const POS_WEB_ORDERS_ROOM = 'pos.web-orders';

export const WebOrderEventNameEnum = z.enum([
  'web-order.created',
  'web-order.cancelled',
]);
export type WebOrderEventName = z.infer<typeof WebOrderEventNameEnum>;

export const WebOrderEventSchema = z.object({
  event: WebOrderEventNameEnum,
  order: PublicWebOrderSchema,
  emittedAt: z.string().datetime(),
});
export type WebOrderEvent = z.infer<typeof WebOrderEventSchema>;
