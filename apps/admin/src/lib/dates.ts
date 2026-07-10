import { startOfBusinessDay } from '@pos-tercos/domain';

/**
 * Inicio del día de NEGOCIO (corte 4 am, hora local del dispositivo) en ISO —
 * filtro estándar de "lo del día" en las vistas operativas de la caja (historial,
 * panel de pedidos). Portado de apps/pos (unificación POS+admin, Fase 2b).
 */
export function startOfTodayIso(): string {
  return startOfBusinessDay(new Date()).toISOString();
}

/**
 * YYYY-MM-DD del día calendario LOCAL del navegador.
 *
 * NUNCA usar `toISOString().slice(0, 10)` para esto: toISOString es UTC y en
 * Bogotá (UTC-5) desde las 19:00 devuelve la fecha de MAÑANA — el backend
 * rechaza esa fecha de pago como "futura". Espejo de `ymdLocal` del API.
 */
export function ymdLocalToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
