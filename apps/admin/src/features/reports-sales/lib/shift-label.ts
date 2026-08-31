import type { Shift } from '@pos-tercos/types';
import { BUSINESS_TIME_ZONE } from '@pos-tercos/ui';

const dayTime = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const timeOnly = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });

// El día lo decide la hora del LOCAL, no la del runtime: esta página se arma
// en el servidor (que corre en UTC), donde una caja de las 8 pm a las 11 pm ya
// se ve como dos días distintos y el aviso de "cruzó la medianoche" salía solo.
const ymdBogota = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date(iso));

const sameCalendarDay = (a: string, b: string): boolean => ymdBogota(a) === ymdBogota(b);

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
