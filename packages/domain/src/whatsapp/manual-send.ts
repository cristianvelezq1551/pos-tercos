/**
 * Link `wa.me` para que el CAJERO le escriba al cliente desde su propio
 * WhatsApp.
 *
 * Por qué manual y no automático (decisión del dueño, 2026-07-27): mandar por
 * un gateway exige chip dedicado, número registrado en Meta y templates
 * aprobados, y el cliente termina respondiéndole a un número que nadie lee. El
 * sistema escribe el mensaje; lo manda la persona, desde el hilo donde el
 * cliente ya le va a mandar el comprobante. Mismo criterio que el pedido al
 * proveedor (`supplier-order-link.ts`, §7.v19).
 *
 * El TEXTO es exactamente el mismo que enviaría el envío automático
 * (`buildNotificationMessage`): una sola fuente, para que el día que se
 * encienda Kapso el cliente no note un cambio de voz.
 */

import { buildNotificationMessage } from './messages';
import type {
  WhatsAppLinkResult,
  WhatsAppMessageOptions,
  WhatsAppNotificationStage,
  WhatsAppSaleSnapshot,
} from './types';
import { normalizeWaPhone, toWaLink } from './wa-link';

/**
 * null si el pedido no tiene un teléfono con el que se pueda armar el chat
 * (nunca debería pasar en un pedido web —el checkout lo exige— pero una venta
 * de mostrador convertida a cuenta abierta puede no tenerlo).
 */
export function buildManualNotificationLink(
  stage: WhatsAppNotificationStage,
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppMessageOptions,
): WhatsAppLinkResult | null {
  const phone = normalizeWaPhone(sale.customerPhone);
  if (!phone) return null;
  return toWaLink(phone, buildNotificationMessage(stage, sale, opts));
}
