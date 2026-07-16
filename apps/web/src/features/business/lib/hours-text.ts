import { WEEKDAY_LABELS, type TimeRange, type WeekdayKey } from '@pos-tercos/types';

/** Lunes primero: es como el cliente lee una semana (el dato usa 0=domingo). */
export const WEEK_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export { WEEKDAY_LABELS };

/** "17:00" → "5:00 pm". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h)) return hhmm;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(r: TimeRange): string {
  return `${formatTime(r.start)} – ${formatTime(r.end)}`;
}

/** Vacío = cerrado. Es la convención del motor: día sin rangos, día de descanso. */
export function formatDayRanges(ranges: TimeRange[]): string {
  if (ranges.length === 0) return 'Cerrado';
  return ranges.map(formatRange).join(' · ');
}

/** El día de la semana de HOY, en la clave que usa el horario. */
export function todayKey(now: Date = new Date()): WeekdayKey {
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[now.getDay()]!;
}

/**
 * "Abre mañana a las 5:00 pm" — el texto del banner de cerrado.
 * `nextOpenAt` lo calcula el SERVER (hora de Bogotá): acá solo se formatea, sin
 * volver a decidir si está abierto.
 */
export function formatNextOpen(nextOpenAtIso: string | null, now: Date = new Date()): string | null {
  if (!nextOpenAtIso) return null;
  const at = new Date(nextOpenAtIso);
  if (Number.isNaN(at.getTime())) return null;

  // A mano y no con Intl: en es-CO devuelve "5:00 p. m." (con punto final), que
  // choca con el punto de la frase ("…a las 5:00 p. m..") y además no coincide
  // con el "5:00 pm" que usa el resto de la web.
  const time = formatTime(
    `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
  );

  const days = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return `hoy a las ${time}`;
  if (days === 1) return `mañana a las ${time}`;
  const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(at);
  return `el ${weekday} a las ${time}`;
}
