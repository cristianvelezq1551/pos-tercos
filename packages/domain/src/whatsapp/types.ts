/**
 * Notificaciones WhatsApp al cliente vía OpenWA (gateway self-hosted).
 * El backend ENVÍA los mensajes automáticamente en las transiciones de la
 * venta web (aceptar → instrucciones de pago, confirmar → recibido, listo
 * → retirar). El operador ya no abre wa.me manual.
 *
 * El domain solo construye el TEXTO del mensaje (puro, sin IO). El envío
 * real lo hace un `WhatsAppProvider` implementado en apps/api (adapter
 * OpenWA / mock).
 */

/**
 * Etapas que disparan una notificación al cliente (pedidos web).
 *
 * `pickup_ready` = "el pedido está listo". El TEXTO cambia según sea para
 * recoger o domicilio (ver `buildPickupReadyMessage`), pero la etapa es la
 * misma: comparte el flag de idempotencia `notified_ready_for_pickup`.
 */
export type WhatsAppNotificationStage =
  | 'payment_instructions'
  | 'payment_received'
  | 'pickup_ready'
  | 'canceled';

export interface WhatsAppSaleSnapshot {
  /** Número de recibo (corto, lo que ve el cliente). */
  receiptNumber: number;
  /** Nombre del cliente capturado en checkout. Si vacío usamos "Hola". */
  customerName: string | null;
  /** Phone E.164 colombiano, formato `+57XXXXXXXXXX`. */
  customerPhone: string | null;
  /** Total del pedido en COP (ya con descuentos). */
  total: number;
  /** Dirección de entrega. Presente ⇒ es domicilio y NO se retira en el local. */
  deliveryAddress?: string | null;
}

export interface WhatsAppMessageOptions {
  /** Nombre del local que firma el mensaje. */
  businessName: string;
  /** Dirección corta para el "Te esperamos en X" del mensaje de listo. */
  businessAddressShort?: string | null;
  /** Datos de pago (Nequi/transferencia), de env. Solo en instrucciones. */
  paymentInstructions?: string | null;
}

/** Resultado del envío. El adapter nunca lanza — devuelve ok/error. */
export interface WhatsAppSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

/**
 * Mensaje por TEMPLATE pre-aprobado de Meta (Cloud API). Obligatorio para
 * mensajes business-initiated fuera de la ventana de 24h. Los `variables`
 * llenan {{1}}, {{2}}, … EN ORDEN y no pueden contener saltos de línea
 * (usar `sanitizeTemplateParam`).
 */
export interface WhatsAppTemplateMessage {
  /** Nombre EXACTO del template aprobado en Meta/Kapso. */
  name: string;
  /** Language code del template ('es' o 'es_CO'). */
  languageCode: string;
  /** Valores para {{1}}..{{n}} en orden. */
  variables: string[];
}

/**
 * Puerto de envío. Implementado en apps/api por KapsoWhatsAppAdapter (Cloud
 * API oficial), OpenWaWhatsAppAdapter (legacy) y MockWhatsAppAdapter (dev).
 * Recibe phone E.164; el adapter lo convierte al formato del proveedor.
 * `sendTemplate` es opcional: solo la Cloud API lo soporta (OpenWA no tiene
 * concepto de template).
 */
export interface WhatsAppProvider {
  sendText(phoneE164: string, text: string): Promise<WhatsAppSendResult>;
  sendTemplate?(
    phoneE164: string,
    template: WhatsAppTemplateMessage,
  ): Promise<WhatsAppSendResult>;
}

// --- Alerta interna de descuadre (wa.me al Dueño, NO al cliente) ---

export interface WhatsAppLinkResult {
  /** URL `https://wa.me/<digits>?text=<encoded>`. */
  url: string;
  /** Mensaje plano (sin URL-encode) para debug / audit. */
  messagePlain: string;
}
