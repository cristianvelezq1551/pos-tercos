import { colombianHolidays } from './colombia-holidays';

/**
 * Semana de nómina para empleados DIARIO. El negocio descansa los LUNES; ese
 * descanso es el borde entre semanas. La semana de pago es la corrida de días
 * laborables entre dos descansos (NO un bucket fijo lunes–domingo).
 *
 * Corrimiento por festivo: si un lunes es festivo, el negocio abre ese lunes y
 * el descanso se corre al siguiente día no-festivo (martes). Como consecuencia,
 * el lunes festivo queda como ÚLTIMO día de su semana (se trabaja y se paga), y
 * la semana siguiente arranca el miércoles. Ej. (lunes 1-jun festivo):
 *   - Semana: martes 26-may … lunes 1-jun (festivo, se paga).
 *   - Siguiente: miércoles 3-jun … domingo 7-jun.
 */

const DAY_MS = 86_400_000;
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export type PayrollDayStatus = 'WORKDAY' | 'REST';

export interface PayrollWeekDay {
  /** YYYY-MM-DD (UTC). */
  date: string;
  /** 0=domingo … 6=sábado. */
  weekday: number;
  isHoliday: boolean;
  /** Dentro del span todos los días son laborables (el descanso es el borde). */
  status: PayrollDayStatus;
}

export interface PayrollWeek {
  /** Primer día laborable del span (YYYY-MM-DD). */
  weekStart: string;
  /** Último día laborable = el cierre (un lunes festivo si aplica). */
  weekEnd: string;
  weekLabel: string;
  days: PayrollWeekDay[];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}
function atUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Sin caché a nivel de módulo: `domain` es de funciones PURAS (sin estado
// compartido mutable). `colombianHolidays(y)` es pura y barata; isHoliday se
// llama O(6) veces por semana → recomputar es despreciable.
function isHoliday(d: Date): boolean {
  return colombianHolidays(d.getUTCFullYear()).has(ymd(d));
}

/** Lunes (UTC) de la semana ISO de `date`. */
function isoMonday(date: Date): Date {
  const base = atUtcMidnight(date);
  const back = (base.getUTCDay() + 6) % 7;
  return addDays(base, -back);
}

/** Descanso efectivo de la semana ISO de `date`: el lunes, corrido al siguiente
 *  día no-festivo si el lunes es festivo. */
function effectiveRestDate(date: Date): Date {
  let d = isoMonday(date);
  let guard = 0;
  while (isHoliday(d) && guard < 6) {
    d = addDays(d, 1);
    guard++;
  }
  return d;
}

function isRestDate(date: Date): boolean {
  return ymd(effectiveRestDate(date)) === ymd(atUtcMidnight(date));
}

/** Semana de nómina (corrida de laborables entre descansos) que contiene `ref`.
 *  Si `ref` cae en un descanso, devuelve la semana SIGUIENTE. */
export function payrollWeekFor(ref: Date): PayrollWeek {
  let cur = atUtcMidnight(ref);
  let guard = 0;
  while (isRestDate(cur) && guard < 8) {
    cur = addDays(cur, 1);
    guard++;
  }
  let start = cur;
  while (!isRestDate(addDays(start, -1))) start = addDays(start, -1);
  let end = cur;
  while (!isRestDate(addDays(end, 1))) end = addDays(end, 1);

  const days: PayrollWeekDay[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    days.push({ date: ymd(d), weekday: d.getUTCDay(), isHoliday: isHoliday(d), status: 'WORKDAY' });
  }
  return { weekStart: ymd(start), weekEnd: ymd(end), weekLabel: labelOf(start, end), days };
}

/** Ref (YYYY-MM-DD) para navegar a la semana siguiente. */
export function nextWeekRef(week: PayrollWeek): string {
  return ymd(addDays(parseYmd(week.weekEnd), 1));
}

/** Ref (YYYY-MM-DD) para navegar a la semana anterior. */
export function prevWeekRef(week: PayrollWeek): string {
  let d = addDays(parseYmd(week.weekStart), -1);
  let guard = 0;
  while (isRestDate(d) && guard < 8) {
    d = addDays(d, -1);
    guard++;
  }
  return ymd(d);
}

function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function labelOf(start: Date, end: Date): string {
  const sd = start.getUTCDate();
  const ed = end.getUTCDate();
  const sm = MONTHS_SHORT[start.getUTCMonth()];
  const em = MONTHS_SHORT[end.getUTCMonth()];
  const y = end.getUTCFullYear();
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `Semana ${sd}–${ed} ${sm} ${y}`;
  }
  return `Semana ${sd} ${sm} – ${ed} ${em} ${y}`;
}
