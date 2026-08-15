/**
 * Link `wa.me` que abre el chat del PROVEEDOR con el pedido ya escrito.
 *
 * Por qué un link y no un envío automático (decisión del dueño 2026-07-27):
 * el pedido a un proveedor es una conversación, no una notificación. Sale del
 * WhatsApp personal de quien compra —con su historial, sus fotos y su nombre—
 * y quien recibe contesta ahí mismo. Mandarlo desde el número del sistema
 * rompía el hilo y dejaba al proveedor respondiéndole a un número que nadie
 * lee. Además, el mensaje queda EDITABLE antes de enviarse: quien pide agrega
 * lo que la pantalla no sabe.
 *
 * ⚠️ El mensaje NO habla de precios (decisión del dueño): qué cobra el
 * proveedor se negocia en el chat, y sacar a relucir lo que nos cobró la vez
 * pasada ancla la conversación en el peor lugar posible.
 *
 * ⚠️ Este link NO envía nada: deja el texto escrito y la persona toca enviar.
 */

import type { WhatsAppLinkResult } from './types';
import { normalizeWaPhone, toWaLink } from './wa-link';

export interface SupplierOrderItem {
  name: string;
  quantity: number;
  /** Unidad de COMPRA (caja, paquete, kg) — la que entiende el proveedor. */
  unitPurchase: string;
}

export interface SupplierOrderLinkInput {
  /** Teléfono del proveedor. Sin él no hay link (la UI lo avisa). */
  supplierPhone: string | null;
  supplierName: string;
  businessName: string;
  items: SupplierOrderItem[];
  /** Cuándo lo queremos, ya legible ("mañana, martes 28 de julio"). */
  neededByLabel?: string | null;
  /** Quién arma el pedido — para que el proveedor sepa a quién contestarle. */
  requestedBy?: string | null;
  /** Teléfono del negocio, como se muestra ("320 761 5261"). */
  businessPhoneDisplay?: string | null;
  /** Dónde entregar. */
  deliveryAddress?: string | null;
  /** Nota libre de quien pide ("que venga bien fresco"). */
  note?: string | null;
}

/** null si el proveedor no tiene teléfono utilizable. */
export function buildSupplierOrderLink(
  input: SupplierOrderLinkInput,
): WhatsAppLinkResult | null {
  const phone = normalizeWaPhone(input.supplierPhone);
  if (!phone) return null;
  return toWaLink(phone, buildSupplierOrderMessage(input));
}

/** El texto del pedido. Separado del link para poder previsualizarlo. */
export function buildSupplierOrderMessage(input: SupplierOrderLinkInput): string {
  const lines: string[] = [];
  const supplier = input.supplierName.trim();

  lines.push(supplier ? `Hola, *${supplier}* 👋` : 'Hola 👋');
  lines.push(`Te escribimos de *${input.businessName}*.`);
  lines.push('');
  lines.push(
    input.items.length === 1
      ? 'Queremos hacerte este pedido:'
      : `Queremos hacerte este pedido (${input.items.length} ítems):`,
  );
  lines.push('');

  const numbered = input.items.length > 1;
  input.items.forEach((item, i) => {
    const bullet = numbered ? `${i + 1}. ` : '';
    lines.push(`${bullet}*${item.name}* — ${formatQty(item.quantity)} ${item.unitPurchase}`);
  });

  const neededBy = input.neededByLabel?.trim();
  if (neededBy) {
    lines.push('');
    lines.push(`📅 Lo necesitamos: ${neededBy}`);
  }

  const note = input.note?.trim();
  if (note) {
    if (!neededBy) lines.push('');
    lines.push(`📝 ${note}`);
  }

  const address = input.deliveryAddress?.trim();
  if (address) {
    lines.push('');
    lines.push(`📍 Entrega en: ${address}`);
  }

  const contactName = input.requestedBy?.trim();
  const contactPhone = input.businessPhoneDisplay?.trim();
  if (contactName || contactPhone) {
    const parts = [contactName, contactPhone].filter(Boolean).join(' · ');
    if (!address) lines.push('');
    lines.push(`📞 Contacto: ${parts}`);
  }

  lines.push('');
  lines.push('¿Nos confirmas si lo tienes y a qué hora lo puedes despachar?');
  lines.push('Gracias! 🙌');

  return lines.join('\n');
}

/** Cantidades enteras sin decimales; fraccionarias con máximo 2. */
function formatQty(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  return String(Math.round(quantity * 100) / 100);
}
