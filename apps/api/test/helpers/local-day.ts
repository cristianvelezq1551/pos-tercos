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

/** Igual que `hoyLocal` pero desplazado `n` días (negativo = atrás). */
export const diaLocal = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
};
