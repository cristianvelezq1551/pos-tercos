import type { TimeRange } from '@pos-tercos/types';

/** "17:00" → "5:00 pm". El dueño piensa en 12 h; el dato se guarda en 24 h. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h)) return hhmm;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Un rango que termina antes de empezar sigue de largo hasta la madrugada. */
export function formatRange(r: TimeRange): string {
  const crosses = r.end <= r.start;
  return `${formatTime(r.start)} – ${formatTime(r.end)}${crosses ? ' (día siguiente)' : ''}`;
}

/** Vacío = cerrado. Es la convención del motor: día sin rangos, día de descanso. */
export function formatDayRanges(ranges: TimeRange[]): string {
  if (ranges.length === 0) return 'Cerrado';
  return ranges.map(formatRange).join(' · ');
}

/** "2026-07-20" → "lunes 20 de julio". Para la lista de excepciones. */
export function formatOverrideDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  // Mediodía UTC: evita que la zona horaria corra el día al formatear.
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
