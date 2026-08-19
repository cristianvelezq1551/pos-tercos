/**
 * Link `wa.me` que abre el chat del cliente con SU pedido ya escrito.
 *
 * Por qué existe (decisión del dueño 2026-07-16): el pedido se crea en la WEB
 * —con precios, promos, stock, horario y zona ya validados— y el chat solo lo
 * REFERENCIA por su número. Que el cliente escriba primero abre la ventana de
 * servicio de 24 h, donde las respuestas son texto libre y gratis: no hacen
 * falta templates aprobados por Meta para contestarle.
 *
 * ⚠️ Este link NO envía nada: deja el mensaje escrito y el cliente toca enviar.
 * Si no lo toca, no pasa nada malo — la página de éxito ya le mostró el total y
 * los datos de pago. El chat es un canal extra, no el único.
 *
 * El `#N` del pedido es lo que después permite atar el mensaje entrante a la
 * venta. El cliente puede borrarlo (el texto es editable), así que quien lea el
 * mensaje —persona o bot— tiene que poder caer al teléfono del remitente.
 */

import { formatCop } from './format';
import type { WhatsAppLinkResult } from './types';
import { normalizeWaPhone, toWaLink } from './wa-link';

export interface OrderLinkItem {
  productName: string;
  sizeName?: string | null;
  quantity: number;
  modifiers?: string[];
  notes?: string | null;
}

export interface OrderLinkInput {
  /** Teléfono del NEGOCIO (a dónde se escribe). Sin él no hay link. */
  businessPhone: string | null;
  receiptNumber: number;
  customerName: string | null;
  items: OrderLinkItem[];
  total: number;
  /** Presente ⇒ es domicilio: la dirección va en el mensaje. */
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  /** Notas del pedido (no de la entrega). */
  notes?: string | null;
}

/** null si el negocio no tiene teléfono configurado — la web oculta el botón. */
export function buildWebOrderLink(input: OrderLinkInput): WhatsAppLinkResult | null {
  const phone = normalizeWaPhone(input.businessPhone);
  if (!phone) return null;

  const lines: string[] = [];
  lines.push(`Hola! Este es mi pedido #${input.receiptNumber}`);
  if (input.customerName?.trim()) lines.push(`Nombre: ${input.customerName.trim()}`);
  lines.push('');

  for (const item of input.items) {
    const size = item.sizeName ? ` (${item.sizeName})` : '';
    lines.push(`• ${item.quantity}x ${item.productName}${size}`);
    for (const mod of item.modifiers ?? []) lines.push(`   + ${mod}`);
    if (item.notes?.trim()) lines.push(`   * ${item.notes.trim()}`);
  }

  lines.push('');
  const address = input.deliveryAddress?.trim();
  // En domicilio el total NO es final: falta el envío, que el local cotiza con
  // el domiciliario. Decir "Total: $27.000" a secas sería mentirle al cliente.
  lines.push(address ? `Pedido: ${formatCop(input.total)}` : `Total: ${formatCop(input.total)}`);

  if (address) {
    lines.push('');
    lines.push('🛵 A domicilio');
    lines.push(`Dirección: ${address}`);
    if (input.deliveryNotes?.trim()) lines.push(`Referencias: ${input.deliveryNotes.trim()}`);
  } else {
    lines.push('');
    lines.push('🏪 Paso a recogerlo al local');
  }

  if (input.notes?.trim()) {
    lines.push('');
    lines.push(`Nota: ${input.notes.trim()}`);
  }

  lines.push('');
  lines.push(
    address
      ? '¿Cuánto sale el domicilio? Quedo atento para pagar 🙌'
      : 'Quedo atento al pago 🙌',
  );

  return toWaLink(phone, lines.join('\n'));
}
