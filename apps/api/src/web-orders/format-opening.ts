/**
 * "Abrimos el martes a las 5:00 pm" — el texto que ve el cliente cuando
 * intenta pedir con el local cerrado.
 *
 * Se arma en el SERVER porque ahí está la hora buena (TZ=America/Bogota) y
 * porque el mensaje viaja en el error del 503, que la web muestra tal cual.
 */

const WEEKDAY_FMT = new Intl.DateTimeFormat('es-CO', { weekday: 'long' });
const DATE_FMT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });

/**
 * "5:00 pm". A mano y no con Intl: en es-CO devuelve "5:00 p. m." (con punto
 * final) y la frase termina con otro punto → "…a las 5:00 p. m..".
 */
function formatTime(at: Date): string {
  const h = at.getHours();
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(at.getMinutes()).padStart(2, '0')} ${suffix}`;
}

/** Días de calendario LOCAL entre dos instantes (ignora la hora). */
function localDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function formatOpeningMoment(at: Date, now: Date = new Date()): string {
  const time = formatTime(at);
  const days = localDaysBetween(now, at);
  if (days <= 0) return `hoy a las ${time}`;
  if (days === 1) return `mañana a las ${time}`;
  // Más de una semana: "el martes" sería ambiguo, va con fecha.
  if (days >= 7) return `el ${WEEKDAY_FMT.format(at)} ${DATE_FMT.format(at)} a las ${time}`;
  return `el ${WEEKDAY_FMT.format(at)} a las ${time}`;
}
