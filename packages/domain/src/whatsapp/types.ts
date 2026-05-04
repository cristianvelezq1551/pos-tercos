/**
 * WhatsApp wa.me semi-automático (FASE 9). Sin Meta WABA, sin backend
 * que envíe — solo construimos URLs `https://wa.me/<phone>?text=<encoded>`
 * y abrimos en tab nueva. WhatsApp Web/App ya logueado intercepta el
 * deep-link y arma el chat con el mensaje pre-llenado.
 *
 * El operador hace click "enviar" manualmente — esto da margen para
 * adaptar el mensaje si la situación lo amerita.
 */

export type WhatsAppStage = 'accepted' | 'confirmed' | 'ready';

export interface WhatsAppSaleSnapshot {
  /** Numero de recibo (corto, lo que ve el cliente). */
  receiptNumber: number;
  /** Nombre del cliente capturado en checkout. Si está vacío usamos "Hola". */
  customerName: string | null;
  /** Phone E.164 colombiano, formato `+57XXXXXXXXXX`. */
  customerPhone: string | null;
  /** Total del pedido en COP (ya con descuentos). */
  total: number;
  /** WEB_PICKUP / WEB_DELIVERY. COUNTER no genera links (no aplica). */
  type: 'WEB_PICKUP' | 'WEB_DELIVERY';
}

export interface WhatsAppBuildOptions {
  /** Nombre del local que aparece firmado en el mensaje. */
  businessName: string;
  /**
   * Solo para `ready` en pickup. Texto corto de la dirección
   * (ej. "Cra 43A # 11-12, Medellín"). Si null/undefined, omite el
   * "Te esperamos en X" y queda más genérico.
   */
  businessAddressShort?: string | null;
}

export interface WhatsAppLinkResult {
  /** URL `https://wa.me/<digits>?text=<encoded>`. NUNCA undefined cuando applies. */
  url: string;
  /** Mensaje plano (sin URL-encode) para debug / UI preview. */
  messagePlain: string;
}
