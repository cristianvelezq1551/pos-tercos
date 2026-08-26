/**
 * Convención de fechas del sistema (TZ del server = America/Bogota en prod):
 *
 * - Columnas TIMESTAMP (`paidAt`, `createdAt`, …) se comparan contra ventanas
 *   en hora LOCAL (getBusinessMonthWindow / parseDateRange). Eso ya es así.
 * - Columnas FECHA-SOLO (`@db.Date` o escritas vía `parseYmd`) viven en
 *   MEDIANOCHE UTC. Compararlas contra una ventana local corre el borde ~5h
 *   y desplaza el día 1 del mes al mes vecino (novedad de nómina del 1 cae al
 *   mes anterior, gasto puntual del 1 se cuenta dos veces, etc.). Para esas
 *   columnas derivar los límites con `utcDateOfLocalDay`.
 * - Serializar un instante local a YYYY-MM-DD usa el día calendario LOCAL
 *   (`ymdLocal`) — NUNCA `toISOString().slice(0,10)`: en Bogotá el 31 de julio
 *   23:59 es 1 de agosto en UTC y el período mostraba "01 jul – 01 ago".
 */

/** YYYY-MM-DD del día calendario LOCAL de `d`. */
import { BadRequestException } from '@nestjs/common';

export function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Medianoche UTC del día calendario LOCAL de `d` — el límite correcto para
 * comparar contra columnas fecha-solo (que viven en medianoche UTC).
 */
export function utcDateOfLocalDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Medianoche LOCAL de una fecha-solo YYYY-MM-DD — el límite correcto para
 * comparar una fecha elegida por el usuario contra columnas timestamp.
 */
export function localMidnightOfYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Parsea ?from=&to= como YYYY-MM-DD a Date local (00:00 from, 23:59 to).
 * Default: últimos `defaultDays` días (incluyendo hoy).
 */
export function parseDateRange(
  from: string | undefined,
  to: string | undefined,
  defaultDays = 7,
): { from: Date; to: Date } {
  const now = new Date();
  // Una fecha con formato inválido NO cae de vuelta al default en silencio:
  // así `?to=basura` devolvía el rango de hoy y el reporte salía "vacío pero
  // correcto", sin que nadie supiera que la fecha se había ignorado (clase B9).
  let toDate: Date;
  if (to !== undefined) {
    const parsed = parseLocalDate(to);
    if (!parsed) throw new BadRequestException('La fecha final debe ser AAAA-MM-DD.');
    toDate = parsed;
  } else {
    toDate = now;
  }
  const toEnd = new Date(toDate);
  toEnd.setHours(23, 59, 59, 999);

  let fromDate: Date;
  if (from !== undefined) {
    const parsed = parseLocalDate(from);
    if (!parsed) throw new BadRequestException('La fecha inicial debe ser AAAA-MM-DD.');
    fromDate = parsed;
  } else {
    fromDate = new Date(toEnd);
    fromDate.setDate(fromDate.getDate() - (defaultDays - 1));
  }
  fromDate.setHours(0, 0, 0, 0);

  if (fromDate > toEnd) {
    throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
  }
  return { from: fromDate, to: toEnd };
}

function parseLocalDate(s: string): Date | null {
  // YYYY-MM-DD → Date local 00:00. Devuelve null si formato inválido.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
