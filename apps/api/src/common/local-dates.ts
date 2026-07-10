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
