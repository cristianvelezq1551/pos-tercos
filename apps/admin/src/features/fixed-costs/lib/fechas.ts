/** Meses abreviados en español, indexados 0-11. */
export const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/**
 * "15 mar 2026" desde un YYYY-MM-DD. Se parsea por partes a propósito: pasarlo
 * por `new Date(ymd)` lo lee como medianoche UTC y en Bogotá muestra el día
 * anterior.
 */
export function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MESES[(m ?? 1) - 1]} ${y}`;
}
