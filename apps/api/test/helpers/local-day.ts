import { ymdLocal } from '../../src/common/local-dates';

/**
 * El día calendario LOCAL de hoy, en YYYY-MM-DD.
 *
 * NUNCA usar `new Date().toISOString().slice(0, 10)` en un test que consulta
 * un reporte por rango de fechas: `toISOString` es UTC, y en Bogotá (−05:00)
 * a partir de las 19:00 devuelve el día SIGUIENTE. El test pasa toda la tarde
 * y se cae de noche pidiéndole al reporte un día en el que no pasó nada — que
 * es justo la franja en la que este negocio vende.
 *
 * Es la misma regla que ya rige el código de producción (§3, `local-dates.ts`).
 */
export const hoyLocal = (): string => ymdLocal(new Date());

/**
 * El mes calendario LOCAL de hoy, como query `year=YYYY&month=M`.
 *
 * Misma trampa que `hoyLocal`, pero peor de encontrar: `getUTCMonth()` solo
 * difiere del mes local **el último día del mes después de las 19:00** en
 * Bogotá. O sea que el test pasa todos los días del año menos uno, y ese día
 * revienta pidiéndole al reporte el mes siguiente, donde el pago que acaba de
 * hacer todavía no existe. Pasó el 2026-08-31 a las 19:35 en `payroll-weekly`.
 */
export const mesLocalQuery = (at: Date = new Date()): string =>
  `year=${at.getFullYear()}&month=${at.getMonth() + 1}`;

/** Igual que `hoyLocal` pero desplazado `n` días (negativo = atrás). */
export const diaLocal = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
};

/**
 * Espera a que pase la medianoche si el reloj está en los últimos segundos del
 * día local.
 *
 * Una promoción «todo el día» se define `00:00:00 → 23:59:59`, pero el motor
 * evalúa la ventana como **[inicio, fin)** y `HH:MM:SS` no admite `24:00:00`
 * (`parseTimeToSeconds` solo acepta horas 00–23). O sea: ninguna ventana puede
 * cubrir los 86.400 segundos del día, y a las 23:59:59 una promo «siempre
 * vigente» NO aplica. En producción eso es un segundo al día sin descuento —
 * inofensivo, y cambiar la semántica del motor por eso sería peor.
 *
 * Para la simulación sí importa: su contabilidad sombra asume que esas promos
 * están vigentes, así que una corrida que cruce ese segundo falla por el reloj
 * y no por la plata, dejando el CI rojo al azar. Se espera con margen porque
 * la promo se evalúa en el SERVIDOR: una operación que arranca en 23:59:58 aún
 * puede aterrizar del otro lado.
 */
export const evitarElSegundoSinPromos = async (): Promise<void> => {
  const ahora = new Date();
  const enElBorde = ahora.getHours() === 23 && ahora.getMinutes() === 59 && ahora.getSeconds() >= 58;
  if (!enElBorde) return;
  const despuesDeMedianoche = new Date(ahora);
  despuesDeMedianoche.setHours(24, 0, 0, 100);
  await new Promise((resolver) => setTimeout(resolver, despuesDeMedianoche.getTime() - ahora.getTime()));
};
