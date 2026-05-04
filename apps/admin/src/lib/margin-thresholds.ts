/**
 * Umbrales de margen (%). Cómo se interpretan:
 *  - margin >= excellent → tono "good" (verde)
 *  - excellent > margin >= good → tono "warn" (amber)
 *  - good > margin >= 0 → tono "poor" (orange) — ganancia mínima
 *  - margin < 0 → tono "bad" (red) — pérdida
 *
 * Negociables con el dueño según el tipo de producto / segmento.
 */
export const MARGIN_THRESHOLDS = {
  excellent: 30,
  good: 10,
} as const;

export type MarginTone = 'good' | 'warn' | 'poor' | 'bad';

export function marginTone(value: number): MarginTone {
  if (value >= MARGIN_THRESHOLDS.excellent) return 'good';
  if (value >= MARGIN_THRESHOLDS.good) return 'warn';
  if (value >= 0) return 'poor';
  return 'bad';
}

export const MARGIN_TONE_CLASS: Record<MarginTone, string> = {
  good: 'text-green-700',
  warn: 'text-amber-700',
  poor: 'text-orange-700',
  bad: 'text-red-700',
};
