/**
 * Motor de horarios de atención — puro, sin IO.
 *
 * Modelo (decisión del dueño 2026-07-16):
 *  - `weekly`: rangos por día de la semana. Varios por día (ej. almuerzo y
 *    noche) y pueden cruzar medianoche (`{start:'18:00', end:'02:00'}`). Un día
 *    SIN rangos = cerrado (día de descanso).
 *  - `restDayHolidayShift`: si el día de descanso cae FESTIVO, se trabaja ese
 *    día con los horarios del día siguiente y se descansa el siguiente. Es un
 *    SWAP, no hardcodea el lunes: sale de qué día quedó vacío en `weekly`.
 *  - `overrides`: excepciones por fecha puntual. Le ganan a TODO — son el
 *    escape del dueño ("este lunes sí abrimos", "el 24 cerramos temprano").
 *
 * Todo corre en hora LOCAL del runtime (server con TZ=America/Bogota en prod),
 * misma convención que `business-day.ts`.
 */

import { isColombianHolidayYmd } from '../common/colombia-holidays';

/** Índice de día tal cual lo devuelve `Date.getDay()`: 0 = domingo. */
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Rango de atención en hora local. `end <= start` significa que cruza medianoche. */
export interface TimeRange {
  /** HH:MM 24h. */
  start: string;
  /** HH:MM 24h. */
  end: string;
}

export type WeeklyHours = Record<WeekdayKey, TimeRange[]>;

/** Excepción para una fecha puntual. Le gana a `weekly` y a la regla de festivos. */
export interface DateOverride {
  /** YYYY-MM-DD. */
  date: string;
  /** true = cerrado ese día pase lo que pase. */
  closed: boolean;
  /** Rangos de ese día. Se ignora si `closed`. */
  ranges: TimeRange[];
  note?: string;
}

export interface OpeningHours {
  weekly: WeeklyHours;
  overrides: DateOverride[];
  restDayHolidayShift: boolean;
}

export const EMPTY_WEEKLY: WeeklyHours = {
  sun: [],
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
};

/** Minutos desde medianoche. Devuelve NaN si el formato no es HH:MM válido. */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** Un rango cruza medianoche cuando termina en (o antes de) su propio inicio. */
export function crossesMidnight(r: TimeRange): boolean {
  return toMinutes(r.end) <= toMinutes(r.start);
}

/**
 * Los rangos que ARRANCAN en esa fecha, ya resueltos (override → festivo → weekly).
 * Vacío = cerrado. Ordenados por hora de inicio.
 */
export function resolveDayRanges(date: string, hours: OpeningHours): TimeRange[] {
  const override = hours.overrides.find((o) => o.date === date);
  if (override) return override.closed ? [] : sortRanges(override.ranges);

  if (hours.restDayHolidayShift) {
    // Hoy es el descanso y cae festivo → se trabaja con los horarios de mañana.
    if (isRestWeekday(date, hours) && isColombianHolidayYmd(date)) {
      return sortRanges(weeklyOf(addDays(date, 1), hours));
    }
    // Ayer era el descanso y cayó festivo → el descanso se corrió a hoy.
    const yesterday = addDays(date, -1);
    if (isRestWeekday(yesterday, hours) && isColombianHolidayYmd(yesterday)) return [];
  }

  return sortRanges(weeklyOf(date, hours));
}

/** ¿El local está atendiendo en ese instante? */
export function isOpenAt(at: Date, hours: OpeningHours): boolean {
  const minutes = at.getHours() * 60 + at.getMinutes();
  const today = ymdOf(at);

  for (const r of resolveDayRanges(today, hours)) {
    const start = toMinutes(r.start);
    const end = toMinutes(r.end);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (crossesMidnight(r) ? minutes >= start : minutes >= start && minutes < end) {
      return true;
    }
  }

  // La cola de un rango de ayer que cruzó medianoche (ej. 18:00–02:00 a la 1 am).
  for (const r of resolveDayRanges(addDays(today, -1), hours)) {
    if (!crossesMidnight(r)) continue;
    const end = toMinutes(r.end);
    if (!Number.isNaN(end) && minutes < end) return true;
  }

  return false;
}

/**
 * Próxima apertura a partir de `from` (exclusivo del rango en curso: si ya está
 * abierto, devuelve el arranque del PRÓXIMO rango). null si no abre en
 * `maxDays` — pasa si quedó todo vacío o todo con override cerrado.
 */
export function nextOpenAt(from: Date, hours: OpeningHours, maxDays = 14): Date | null {
  const fromMinutes = from.getHours() * 60 + from.getMinutes();
  let date = ymdOf(from);

  for (let day = 0; day <= maxDays; day++) {
    for (const r of resolveDayRanges(date, hours)) {
      const start = toMinutes(r.start);
      if (Number.isNaN(start)) continue;
      if (day === 0 && start <= fromMinutes) continue;
      return atLocalTime(date, start);
    }
    date = addDays(date, 1);
  }
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function weeklyOf(date: string, hours: OpeningHours): TimeRange[] {
  return hours.weekly[weekdayKeyOf(date)] ?? [];
}

/** Día sin rangos en `weekly` = día de descanso. */
function isRestWeekday(date: string, hours: OpeningHours): boolean {
  return weeklyOf(date, hours).length === 0;
}

function sortRanges(ranges: TimeRange[]): TimeRange[] {
  return [...ranges].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

function weekdayKeyOf(date: string): WeekdayKey {
  const [y, m, d] = splitYmd(date);
  return WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

/** YYYY-MM-DD en hora LOCAL — nunca `toISOString()`, que corre el día en Bogotá. */
function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Aritmética de calendario en UTC para que sumar días nunca corra la fecha. */
function addDays(date: string, days: number): string {
  const [y, m, d] = splitYmd(date);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + days);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate(),
  ).padStart(2, '0')}`;
}

function splitYmd(date: string): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

function atLocalTime(date: string, minutes: number): Date {
  const [y, m, d] = splitYmd(date);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}
