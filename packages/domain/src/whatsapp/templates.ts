/**
 * Builders puros de mensajes por TEMPLATE de la WhatsApp Cloud API (Kapso).
 * Espejan 1:1 los templates registrados en Meta (kapso-setup.md Paso 3):
 * mismo nombre y mismo orden de variables. El texto humano equivalente lo
 * sigue armando messages.ts (fallback sendText + registro en whatsapp_messages).
 *
 * Regla de Meta: los valores de variable NO admiten saltos de línea, tabs ni
 * 4+ espacios seguidos → `sanitizeTemplateParam` normaliza todo a una línea.
 */

import { formatCop } from './format';
import type {
  WhatsAppMessageOptions,
  WhatsAppNotificationStage,
  WhatsAppSaleSnapshot,
  WhatsAppTemplateMessage,
} from './types';

/** Language code por defecto de los templates registrados. */
export const WHATSAPP_TEMPLATE_LANG_DEFAULT = 'es';

/** Nombres EXACTOS de los templates a registrar en Meta/Kapso (utility, es). */
export const WHATSAPP_TEMPLATE_NAMES = {
  payment_instructions: 'payment_instructions',
  payment_received: 'payment_received',
  pickup_ready: 'pickup_ready',
  /** §2.6: un DOMICILIO no se retira — va en camino. Template propio cuya
   *  variable 4 es la dirección de ENTREGA (no la del local). Registrar en Meta
   *  junto a los otros (kapso-setup.md). Sin esto, un domicilio "listo" recibía
   *  el template de retiro ("te esperamos en el local"). */
  delivery_on_way: 'delivery_en_camino',
  canceled: 'order_canceled',
  /** Alerta interna al dueño (descuadres, anulaciones, descuentos…). */
  owner_alert: 'alerta_negocio',
} as const;

/**
 * Normaliza un valor de variable de template: Meta rechaza el mensaje si un
 * parámetro trae `\n`, `\t` o 4+ espacios. Multi-línea → separador " | ".
 */
export function sanitizeTemplateParam(value: string): string {
  return value
    .replace(/\s*[\r\n\t]+\s*/g, ' | ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Fallback del nombre: los templates saludan "Hola {{1}}" — nunca vacío. */
function customerParam(name: string | null): string {
  const trimmed = name?.trim() ?? '';
  return trimmed ? sanitizeTemplateParam(trimmed) : 'Cliente';
}

/**
 * Template del stage → `{name, languageCode, variables}` listo para el
 * `sendTemplate` del provider. El orden de `variables` DEBE coincidir con los
 * {{n}} del template aprobado (kapso-setup.md Paso 3).
 */
export function buildNotificationTemplate(
  stage: WhatsAppNotificationStage,
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppMessageOptions,
  languageCode: string = WHATSAPP_TEMPLATE_LANG_DEFAULT,
): WhatsAppTemplateMessage {
  const nombre = customerParam(sale.customerName);
  const recibo = String(sale.receiptNumber);
  // `||` a propósito: BUSINESS_NAME="" pasaría un `??` y Meta rechaza
  // variables vacías → NINGUNA notificación se entregaría.
  const negocio = sanitizeTemplateParam(opts.businessName) || 'Tercos';

  switch (stage) {
    case 'payment_instructions':
      // 1=nombre · 2=recibo · 3=negocio · 4=total · 5=datos de pago
      return {
        name: WHATSAPP_TEMPLATE_NAMES.payment_instructions,
        languageCode,
        variables: [
          nombre,
          recibo,
          negocio,
          formatCop(sale.total),
          opts.paymentInstructions?.trim()
            ? sanitizeTemplateParam(opts.paymentInstructions)
            : 'te contactamos por este chat con los datos de pago',
        ],
      };
    case 'payment_received':
      // 1=nombre · 2=recibo · 3=negocio
      return {
        name: WHATSAPP_TEMPLATE_NAMES.payment_received,
        languageCode,
        variables: [nombre, recibo, negocio],
      };
    case 'pickup_ready': {
      // §2.6: un DOMICILIO va en camino (template propio, var 4 = dirección de
      // ENTREGA); un pedido para RECOGER se retira en el local (var 4 = local).
      const delivery = sale.deliveryAddress?.trim();
      if (delivery) {
        // 1=nombre · 2=recibo · 3=negocio · 4=dirección de entrega
        return {
          name: WHATSAPP_TEMPLATE_NAMES.delivery_on_way,
          languageCode,
          variables: [nombre, recibo, negocio, sanitizeTemplateParam(delivery)],
        };
      }
      // 1=nombre · 2=recibo · 3=negocio · 4=dirección del local
      return {
        name: WHATSAPP_TEMPLATE_NAMES.pickup_ready,
        languageCode,
        variables: [
          nombre,
          recibo,
          negocio,
          opts.businessAddressShort?.trim()
            ? sanitizeTemplateParam(opts.businessAddressShort)
            : 'el local',
        ],
      };
    }
    case 'canceled':
      // 1=nombre · 2=recibo · 3=negocio
      return {
        name: WHATSAPP_TEMPLATE_NAMES.canceled,
        languageCode,
        variables: [nombre, recibo, negocio],
      };
  }
}

/**
 * Alerta interna al DUEÑO por template genérico `alerta_negocio` ({{1}} =
 * texto completo aplanado a una línea). El dueño rara vez tiene la ventana
 * de 24h abierta con el número del negocio → sin template no le llegaría.
 */
export function buildOwnerAlertTemplate(
  text: string,
  languageCode: string = WHATSAPP_TEMPLATE_LANG_DEFAULT,
): WhatsAppTemplateMessage {
  return {
    name: WHATSAPP_TEMPLATE_NAMES.owner_alert,
    languageCode,
    variables: [sanitizeTemplateParam(text)],
  };
}
