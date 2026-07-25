import { z } from 'zod';
import { CreateSaleItemSchema } from './sales';

// ====================================================================
// WEB ORDER — pedido público desde apps/web (FASE 7)
// ====================================================================

/**
 * Recoger en el local o entrega a domicilio. COUNTER viene del POS.
 * WEB_DELIVERY vuelve en 2026-07-16 (la v2 lo había eliminado).
 */
export const WebOrderTypeEnum = z.enum(['WEB_PICKUP', 'WEB_DELIVERY']);
export type WebOrderType = z.infer<typeof WebOrderTypeEnum>;

/**
 * Payload de POST /web/orders. Cliente NO autenticado. Backend recalcula
 * subtotal/discount/total contra catálogo + motor de promociones (no
 * confía en lo que llega del browser).
 *
 * Reglas:
 *  - WEB_PICKUP requiere customerName + customerPhone (solo recoger en local).
 *  - phone: ^\+573\d{9}$ (móvil colombiano E.164: +57 + 3XXXXXXXXX). El celular
 *    es el canal de WhatsApp del pedido, así que rechazamos fijos/imposibles.
 */
const PhoneSchema = z
  .string()
  .regex(/^\+573\d{9}$/, 'phone debe ser un celular colombiano (+573XXXXXXXXX)');

export const CreateWebOrderSchema = z
  .object({
    type: WebOrderTypeEnum,
    items: z.array(CreateSaleItemSchema).min(1).max(20),
    customerName: z.string().min(1).max(120),
    customerPhone: PhoneSchema,
    notes: z.string().max(500).optional(),
    /**
     * Ubicación del cliente (GPS del navegador), para validar la zona de
     * cobertura. OPCIONAL a propósito: si niega el permiso no se puede medir
     * y el pedido pasa igual (decisión del dueño 2026-07-16) — el radio es un
     * filtro, no un candado: cualquiera puede negar el permiso o falsear las
     * coordenadas desde el navegador.
     */
    customerLat: z.number().min(-90).max(90).optional(),
    customerLng: z.number().min(-180).max(180).optional(),
    /**
     * Dirección de entrega. OBLIGATORIA en WEB_DELIVERY y prohibida en
     * WEB_PICKUP. Texto libre: el repartidor necesita "torre 2, apto 502,
     * portería azul" — el GPS no alcanza para tocar un timbre.
     */
    deliveryAddress: z.string().trim().min(8).max(300).optional(),
    /** Referencias extra: punto de encuentro, "el timbre no suena", etc. */
    deliveryNotes: z.string().trim().max(300).optional(),
  })
  .refine((d) => (d.customerLat === undefined) === (d.customerLng === undefined), {
    message: 'Envía latitud y longitud juntas, o ninguna.',
  })
  .superRefine((d, ctx) => {
    if (d.type === 'WEB_DELIVERY' && !d.deliveryAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'Para domicilio necesitamos la dirección de entrega.',
      });
    }
    if (d.type === 'WEB_PICKUP' && (d.deliveryAddress || d.deliveryNotes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'Un pedido para recoger no lleva dirección de entrega.',
      });
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
/** Ítem del pedido tal como lo ve el CLIENTE (tracking): nombre + adiciones. */
export const PublicWebOrderItemSchema = z.object({
  productName: z.string(),
  sizeName: z.string().nullable(),
  quantity: z.number().int().positive(),
  /** Adiciones elegidas (tocineta, queso…). Solo nombre — sin ids internos. */
  modifiers: z.array(z.string()),
  notes: z.string().nullable(),
  lineTotal: z.number().nonnegative(),
});
export type PublicWebOrderItem = z.infer<typeof PublicWebOrderItemSchema>;

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
  /** Detalle del pedido (con adiciones) — para el tracking del cliente. */
  items: z.array(PublicWebOrderItemSchema).default([]),
  /**
   * Costo del envío, ya incluido en `total`. 0 = todavía no cotizado (el local
   * lo pregunta al domiciliario) ⇒ en domicilio, el `total` NO es final.
   */
  deliveryFee: z.number().nonnegative().default(0),
  /** A dónde se entrega. null en WEB_PICKUP. El cliente la ve para verificarla. */
  deliveryAddress: z.string().nullable().default(null),
  deliveryNotes: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  /**
   * Instrucciones de pago canónicas (Nequi/transferencia). El backend es la
   * única fuente: las emite el endpoint GET para que el cliente vea siempre el
   * mismo texto en reload / device distinto / share del URL, sin depender de
   * env vars del web app. Ausente en WS events y en el `order` del create
   * response (ahí van top-level en CreateWebOrderResponse).
   */
  paymentInstructions: z.string().optional(),
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
