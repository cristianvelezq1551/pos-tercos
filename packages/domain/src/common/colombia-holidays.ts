/**
 * Festivos de Colombia, puros y determinísticos para cualquier año.
 *
 * Reglas:
 *  - Fijos (no se mueven): Año Nuevo, Trabajo, Independencia (20 jul), Boyacá
 *    (7 ago), Inmaculada (8 dic), Navidad.
 *  - Ley Emiliani (se trasladan al lunes siguiente): Reyes, San José, San Pedro
 *    y San Pablo, Asunción, Día de la Raza, Todos los Santos, Independencia de
 *    Cartagena, y los relativos a Pascua que no son los días santos.
 *  - Relativos a Pascua: Jueves y Viernes Santo (fijos respecto a Pascua);
 *    Ascensión, Corpus Christi y Sagrado Corazón (se trasladan a lunes).
 *
 * Las fechas se manejan en UTC y se devuelven como `YYYY-MM-DD`.
 *
 * OJO — son 18 REGLAS, pero no siempre 18 días distintos: dos pueden caer el
 * mismo día. Pasó en 2025 (San Pedro, 29 jun domingo → lunes 30, cayó sobre
 * Sagrado Corazón) y ese año hubo 17 festivos. El `Set` lo resuelve solo.
 *
 * Lo consumen nómina (`payroll/operating-week`) y los horarios de atención de
 * la web (`schedule/opening-hours`) — por eso vive en `common` y no en un
 * dominio puntual.
 */

const DAY_MS = 86_400_000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Traslada al lunes siguiente (si ya es lunes, no se mueve). Ley Emiliani. */
function toNextMonday(d: Date): Date {
  const w = d.getUTCDay(); // 0=domingo … 1=lunes
  const daysUntilMonday = (1 - w + 7) % 7;
  return addDays(d, daysUntilMonday);
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, gregoriano). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=marzo, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** Set de festivos colombianos del año, como `YYYY-MM-DD`. */
export function colombianHolidays(year: number): Set<string> {
  const out = new Set<string>();
  const add = (d: Date): void => {
    out.add(ymd(d));
  };

  // Fijos.
  add(utc(year, 1, 1)); // Año Nuevo
  add(utc(year, 5, 1)); // Día del Trabajo
  add(utc(year, 7, 20)); // Independencia
  add(utc(year, 8, 7)); // Batalla de Boyacá
  add(utc(year, 12, 8)); // Inmaculada Concepción
  add(utc(year, 12, 25)); // Navidad

  // Emiliani (trasladables al lunes siguiente).
  add(toNextMonday(utc(year, 1, 6))); // Reyes Magos
  add(toNextMonday(utc(year, 3, 19))); // San José
  add(toNextMonday(utc(year, 6, 29))); // San Pedro y San Pablo
  add(toNextMonday(utc(year, 8, 15))); // Asunción de la Virgen
  add(toNextMonday(utc(year, 10, 12))); // Día de la Raza
  add(toNextMonday(utc(year, 11, 1))); // Todos los Santos
  add(toNextMonday(utc(year, 11, 11))); // Independencia de Cartagena

  // Relativos a Pascua.
  const easter = easterSunday(year);
  add(addDays(easter, -3)); // Jueves Santo
  add(addDays(easter, -2)); // Viernes Santo
  add(toNextMonday(addDays(easter, 39))); // Ascensión del Señor
  add(toNextMonday(addDays(easter, 60))); // Corpus Christi
  add(toNextMonday(addDays(easter, 68))); // Sagrado Corazón

  return out;
}

/**
 * ¿La fecha (UTC) es festivo en Colombia?
 *
 * Espera un Date a medianoche UTC (los `@db.Date` de Prisma / `parseYmd`). Con
 * un instante local a última hora del día devolvería el festivo del día
 * siguiente — para YYYY-MM-DD usá `isColombianHolidayYmd`, que no tiene ese filo.
 */
export function isColombianHoliday(date: Date): boolean {
  return colombianHolidays(date.getUTCFullYear()).has(ymd(date));
}

const yearCache = new Map<number, Set<string>>();

/**
 * ¿`YYYY-MM-DD` es festivo? Cachea por año — lo llama el motor de horarios en
 * cada request y recalcular los 18 festivos cada vez no tiene sentido.
 */
export function isColombianHolidayYmd(date: string): boolean {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year)) return false;
  let set = yearCache.get(year);
  if (!set) {
    set = colombianHolidays(year);
    yearCache.set(year, set);
  }
  return set.has(date);
}
