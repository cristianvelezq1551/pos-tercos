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

  const sign = input.difference >= 0 ? '+' : '-';
  // 'es-CO' devuelve "06:10 p. m." — ya termina en punto, así que la hora va
  // en su propia línea sin puntuación adicional (antes salía "p. m..").
  const closedHour = input.closedAt.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
  // Ni el id del turno ni la ruta de la app: al dueño no le sirven para nada
  // y no puede tocarlos. El turno se identifica por cajero y hora de cierre.
  const messagePlain = buildOwnerAlert({
    businessName: input.businessName,
    title: 'Descuadre en el cierre de caja',
    body:
      `Cajero: ${input.cashierName}\n` +
      `Diferencia: ${sign}${formatCop(Math.abs(input.difference))} ` +
      `(${input.difference >= 0 ? 'sobrante' : 'faltante'})\n` +
      `Cerró a las ${closedHour}\n\n` +
      `Míralo en Turnos.`,
  });
  return toWaLink(phone, messagePlain);
}
