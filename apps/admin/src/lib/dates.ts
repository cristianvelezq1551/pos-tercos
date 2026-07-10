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
