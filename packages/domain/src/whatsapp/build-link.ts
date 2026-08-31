/**
 * Alerta interna al Dueño cuando se detecta un descuadre en cierre de
 * turno (FASE 11.A → 15.A). NO es notificación al cliente: es un link
 * wa.me que se persiste en `audit_log.metadata.whatsappAlertUrl` para que
 * el Dueño lo abra desde /audit. (El canal al cliente es Kapso — ver
 * `messages.ts`.)
 *
 * Devuelve null si no hay `ownerPhone` (env `OWNER_WHATSAPP_PHONE`) o el
 * phone no tiene formato válido.
 */

import { formatCop } from './format';
import { buildOwnerAlert } from './owner-alerts';
import type { WhatsAppLinkResult } from './types';
import { normalizeWaPhone, toWaLink } from './wa-link';
import { BUSINESS_TIME_ZONE } from '@pos-tercos/types';

/**
 * El TEXTO del aviso de descuadre, sin depender de que haya un teléfono.
 *
 * Vivía dentro de `buildDiscrepancyAlertLink`, que devuelve null sin
 * `OWNER_WHATSAPP_PHONE` — y como el aviso al dueño salía solo cuando ese link
 * existía, sin teléfono configurado NO se avisaba de ningún descuadre de
 * efectivo, ni siquiera por notificación del navegador. Separarlo hace que el
 * texto sea uno solo y que el canal no dependa del otro.
 */
export function buildDiscrepancyAlertMessage(input: {
  cashierName: string;
  difference: number;
  closedAt: Date;
  businessName: string;
}): string {
  const sign = input.difference >= 0 ? '+' : '-';
  // 'es-CO' devuelve "06:10 p. m." — ya termina en punto, así que la hora va
  // en su propia línea sin puntuación adicional (antes salía "p. m..").
  const closedHour = input.closedAt.toLocaleTimeString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
  // Ni el id del turno ni la ruta de la app: al dueño no le sirven para nada
  // y no puede tocarlos. El turno se identifica por cajero y hora de cierre.
  return buildOwnerAlert({
    businessName: input.businessName,
    title: 'Descuadre en el cierre de caja',
    body:
      `Cajero: ${input.cashierName}\n` +
      `Diferencia: ${sign}${formatCop(Math.abs(input.difference))} ` +
      `(${input.difference >= 0 ? 'sobrante' : 'faltante'})\n` +
      `Cerró a las ${closedHour}\n\n` +
      `Míralo en Turnos.`,
  });
}

export function buildDiscrepancyAlertLink(input: {
  ownerPhone: string | null;
  cashierName: string;
  difference: number;
  shiftId: string;
  closedAt: Date;
  businessName: string;
}): WhatsAppLinkResult | null {
  const phone = normalizeWaPhone(input.ownerPhone);
  if (!phone) return null;
  return toWaLink(phone, buildDiscrepancyAlertMessage(input));
}
