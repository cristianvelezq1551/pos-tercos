import type { FixedCostFrequency } from '@pos-tercos/types';
import { MESES, fmtYmd } from './fechas';

/** Rango de fechas cubierto por un período según la frecuencia del costo. */
export function periodRange(
  frequency: FixedCostFrequency,
  year: number,
  month: number,
  startedAt: string | null,
): string {
  if (frequency === 'ANNUAL') return `1 ene – 31 dic ${year}`;
  if (frequency === 'ONE_TIME') return startedAt ? fmtYmd(startedAt) : `${MESES[month - 1]} ${year}`;
  // MONTHLY: día 0 del mes siguiente = último día del mes actual.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `1 – ${lastDay} ${MESES[month - 1]} ${year}`;
}

/** Vigencia del costo: desde startedAt hasta endedAt (o "sin fecha de fin"). */
export function coverage(startedAt: string | null, endedAt: string | null): string {
  const desde = startedAt ? `desde ${fmtYmd(startedAt)}` : 'sin fecha de inicio';
  const hasta = endedAt ? `hasta ${fmtYmd(endedAt)}` : 'sin fecha de fin (recurrente)';
  return `${desde} · ${hasta}`;
}

/** Meses de atraso del período respecto al mes en curso (0 = mes actual). */
export function monthsOverdue(nowYm: number | null, year: number, month: number): number {
  if (nowYm === null) return 0;
  return nowYm - (year * 12 + month);
}

/** Tono por severidad del atraso: 1 mes → warning (amber); 2+ → destructive. */
export function overdueTone(m: number): { row: string; badge: string } {
  if (m >= 2) {
    return {
      row: 'border-destructive/30 bg-destructive/10',
      badge: 'border-destructive/40 bg-destructive/10 text-destructive',
    };
  }
  return {
    row: 'border-warning-border bg-warning-bg/25',
    badge: 'border-warning-border bg-warning-bg/40 text-warning',
  };
}
