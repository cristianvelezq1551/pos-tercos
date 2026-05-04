import { z } from 'zod';
import { CreateSaleItemSchema } from './sales';

// ====================================================================
// WEB ORDER — pedido público desde apps/web (FASE 7)
// ====================================================================

/** Solo WEB_*, NO COUNTER (esos vienen del POS). */
export const WebOrderTypeEnum = z.enum(['WEB_PICKUP', 'WEB_DELIVERY']);
export type WebOrderType = z.infer<typeof WebOrderTypeEnum>;

/**
 * Payload de POST /web/orders. Cliente NO autenticado. Backend recalcula
 * subtotal/discount/total contra catálogo + motor de promociones (no
 * confía en lo que llega del browser).
 *
 * Reglas:
 *  - WEB_PICKUP requiere customerName + customerPhone. NO acepta deliveryAddress.
 *  - WEB_DELIVERY requiere customerName + customerPhone + deliveryAddress.
 *    (lat/lng + validación 3km llegan en FASE 8.)
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
    /** WEB_DELIVERY: requerido. WEB_PICKUP: ignorado si viene. */
    deliveryAddress: z.string().min(1).max(500).optional(),
    /** WEB_DELIVERY: requeridos (FASE 8). Backend revalida la distancia 3km
     *  con haversine antes de crear el sale. WEB_PICKUP: ignorados. */
    deliveryLat: z.number().min(-90).max(90).optional(),
    deliveryLng: z.number().min(-180).max(180).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'WEB_DELIVERY') {
      if (!data.deliveryAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'WEB_DELIVERY requires deliveryAddress',
          path: ['deliveryAddress'],
        });
      }
      if (data.deliveryLat === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'WEB_DELIVERY requires deliveryLat (use /web/geocode primero)',
          path: ['deliveryLat'],
        });
      }
      if (data.deliveryLng === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'WEB_DELIVERY requires deliveryLng (use /web/geocode primero)',
          path: ['deliveryLng'],
        });
      }
    }
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
  deliveryAddress: z.string().nullable(),
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  /** ISO datetime cuando el cliente clickeó "ya pagué". Null si nunca. */
  customerPaidAt: z.string().datetime().nullable(),
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
// MARK PAID — el cliente clickea "ya pagué" desde la web
// ====================================================================

/**
 * Endpoint POST /web/orders/:id/mark-paid?token=
 *
 * NO cambia el status del sale (sigue PENDIENTE_PAGO). Solo:
 *  1. Setea `customer_paid_at` en metadata audit del sale (snapshot del momento).
 *  2. Emite evento WS al POS (room `pos.web-orders`) para que el cajero
 *     vea la notificación y confirme manualmente desde POS.
 *
 * El cajero verifica monto en Nequi/transfer + clicker confirm-payment del
 * POS (mismo endpoint /sales/:id/confirm-payment de FASE 5).
 */
export const MarkPaidSchema = z.object({
  /** Texto opcional con id de transacción / referencia que el cliente vio. */
  reference: z.string().max(120).optional(),
});
export type MarkPaid = z.infer<typeof MarkPaidSchema>;

// ====================================================================
// WS POS NOTIFICATION (FASE 7.B + 7.E)
// ====================================================================

export const POS_NAMESPACE = '/ws/pos';
export const POS_WEB_ORDERS_ROOM = 'pos.web-orders';

export const WebOrderEventNameEnum = z.enum([
  'web-order.created',
  'web-order.customer-paid',
  'web-order.cancelled',
]);
export type WebOrderEventName = z.infer<typeof WebOrderEventNameEnum>;

export const WebOrderEventSchema = z.object({
  event: WebOrderEventNameEnum,
  order: PublicWebOrderSchema,
  emittedAt: z.string().datetime(),
});
export type WebOrderEvent = z.infer<typeof WebOrderEventSchema>;

// ====================================================================
// GEOCODE (FASE 8) — endpoint público GET /web/geocode?address=
// ====================================================================

export const GeocodeAccuracyEnum = z.enum([
  'address',
  'street',
  'neighborhood',
  'low',
]);
export type GeocodeAccuracy = z.infer<typeof GeocodeAccuracyEnum>;

export const GeocodeResponseSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  formattedAddress: z.string(),
  accuracy: GeocodeAccuracyEnum,
  /** Distancia haversine al local en km, redondeada a 2 decimales. */
  distanceKm: z.number().nonnegative(),
  /** ¿Está dentro de RESTAURANT_DELIVERY_RADIUS_KM? Si no, el cliente
   *  debe usar pickup. */
  withinDeliveryRadius: z.boolean(),
});
export type GeocodeResponse = z.infer<typeof GeocodeResponseSchema>;
