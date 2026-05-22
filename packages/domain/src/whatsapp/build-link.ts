/**
 * Alerta interna al Dueño cuando se detecta un descuadre en cierre de
 * turno (FASE 11.A → 15.A). NO es notificación al cliente: es un link
 * wa.me que se persiste en `audit_log.metadata.whatsappAlertUrl` para que
 * el Dueño lo abra desde /audit. (El canal al cliente es OpenWA — ver
 * `messages.ts`.)
 *
 * Devuelve null si no hay `ownerPhone` (env `OWNER_WHATSAPP_PHONE`) o el
 * phone no tiene formato válido.
 */

import { formatCop } from './format';
import type { WhatsAppLinkResult } from './types';

export function buildDiscrepancyAlertLink(input: {
  ownerPhone: string | null;
  cashierName: string;
  difference: number;
  shiftId: string;
  closedAt: Date;
  businessName: string;
}): WhatsAppLinkResult | null {
  const phone = normalizePhone(input.ownerPhone);
  if (!phone) return null;

  const sign = input.difference >= 0 ? '+' : '';
  const closedHour = input.closedAt.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const messagePlain =
    `[${input.businessName}] ⚠ Descuadre detectado en turno cerrado a las ${closedHour}.\n\n` +
    `Cajero: ${input.cashierName}\n` +
    `Diferencia: ${sign}${formatCop(Math.abs(input.difference))} ` +
    `(${input.difference >= 0 ? 'sobrante' : 'faltante'})\n` +
    `Shift: ${input.shiftId.slice(0, 8)}\n\n` +
    `Revisar el detalle en /shifts/${input.shiftId}.`;
  return toLink(phone, messagePlain);
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function toLink(phone: string, messagePlain: string): WhatsAppLinkResult {
  const encoded = encodeURIComponent(messagePlain);
  return { url: `https://wa.me/${phone}?text=${encoded}`, messagePlain };
}
