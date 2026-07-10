/**
 * Día de NEGOCIO vs día calendario (decisión 2026-07-09).
 *
 * El local opera hasta la madrugada: la caja abierta el jueves 5 pm puede
 * seguir cobrando hasta las 2-3 am del viernes. El "día" de la CAJA no puede
 * cortar a medianoche (bloqueaba ventas a las 00:00 y una caja cerrada a las
 * 2 am consumía el cupo de "una caja por día" del día siguiente).
 *
 * Un instante pertenece al día de negocio D si cae en
 * [D 04:00, D+1 04:00) hora LOCAL. Equivale a: día calendario de (t − 4h).
 *
 * ALCANCE — esto aplica SOLO a la operación de la caja (guard stale, "una
 * caja por día") y a las vistas operativas del POS ("lo de hoy" del cajero).
 * La ATRIBUCIÓN CONTABLE de las ventas NO cambia: reportes, P&G y dashboard
 * siguen en día calendario por `paidAt` (decisión del dueño: lo vendido hasta
 * las 23:59 es de ese día; lo vendido después es del día siguiente).
 *
 * Todas las funciones operan en hora LOCAL del runtime (server con
 * TZ=America/Bogota en prod; browser del POS con la hora del dispositivo) —
 * la misma convención que ya usaba el corte a medianoche.
 */

/** Hora local (0-23) en la que termina el día de negocio anterior y empieza el nuevo. */
export const BUSINESS_DAY_CUTOFF_HOUR = 4;

/**
 * Inicio del día de negocio que contiene `at`: el corte de las 4 am más
 * reciente. Antes de las 4 am → ayer 04:00; desde las 4 am → hoy 04:00.
 */
export function startOfBusinessDay(at: Date = new Date()): Date {
  const start = new Date(at);
  start.setHours(BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
  if (at < start) start.setDate(start.getDate() - 1);
  return start;
}

/**
 * Ventana [start, end) del día de negocio que contiene `at`.
 * `end` es EXCLUSIVO (el corte de las 4 am del día siguiente).
 */
export function businessDayWindow(at: Date = new Date()): { start: Date; end: Date } {
  const start = startOfBusinessDay(at);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** ¿`a` y `b` caen en el mismo día de negocio? */
export function sameBusinessDay(a: Date, b: Date): boolean {
  return startOfBusinessDay(a).getTime() === startOfBusinessDay(b).getTime();
}
