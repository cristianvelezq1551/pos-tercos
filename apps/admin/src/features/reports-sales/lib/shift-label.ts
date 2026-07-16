import type { Shift } from '@pos-tercos/types';

const dayTime = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const timeOnly = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

const sameCalendarDay = (a: string, b: string): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Etiqueta de una caja para el selector: "16/07 17:30 → 02:15 · Cajero Dev".
 * Si el cierre cayó otro día (la noche cruzó medianoche) se muestra el día del
 * cierre también — es justamente la señal que el dueño quiere ver.
 */
export function shiftLabel(shift: Shift): string {
  const open = dayTime(shift.openedAt);
  const who = shift.cashierName ? ` · ${shift.cashierName}` : '';
  if (!shift.closedAt) return `${open} → abierta${who}`;
  const close = sameCalendarDay(shift.openedAt, shift.closedAt)
    ? timeOnly(shift.closedAt)
    : dayTime(shift.closedAt);
  return `${open} → ${close}${who}`;
}

/** ¿La caja cruzó la medianoche? (cierre en día calendario distinto al de apertura) */
export function shiftCrossedMidnight(shift: Shift): boolean {
  if (!shift.closedAt) return false;
  return !sameCalendarDay(shift.openedAt, shift.closedAt);
}
