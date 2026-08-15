import { PAYMENT_METHOD_LABELS, type ExpectedDigitalLine } from '@pos-tercos/types';
import type { ShiftSummary } from './shift-summary';

export interface DigitalTarget {
  method: string;
  name: string;
  expected: number;
}

/**
 * Métodos de cuenta que hay que arquear al cerrar. Manda la lista del server
 * (la MISMA que el cierre exige); el cálculo con las ventas cargadas en el
 * modal es solo respaldo si esa consulta falló — con más ventas que el límite
 * de la página se quedaría corta.
 */
export function digitalTargets(
  serverDigital: ExpectedDigitalLine[] | null,
  summary: ShiftSummary | null,
  digitalNet: Record<string, number> = {},
): DigitalTarget[] {
  if (serverDigital) {
    return serverDigital.map((d) => ({
      method: d.method,
      name: d.name || PAYMENT_METHOD_LABELS[d.method] || d.method,
      expected: d.expected,
    }));
  }
  const fromSales = Object.keys(summary?.byMethod ?? {}).filter(
    (m) => m !== 'CASH' && m !== 'UNKNOWN' && (summary?.byMethod[m]?.total ?? 0) > 0,
  );
  const fromMovs = Object.keys(digitalNet).filter((m) => digitalNet[m] !== 0);
  return [...new Set([...fromSales, ...fromMovs])].map((method) => ({
    method,
    name: PAYMENT_METHOD_LABELS[method] || method,
    expected: (summary?.byMethod[method]?.total ?? 0) + (digitalNet[method] ?? 0),
  }));
}

/** Métodos todavía sin contar. Vacío = se puede cerrar. */
export function missingDigitalCounts(
  targets: DigitalTarget[],
  values: Record<string, number | null>,
): DigitalTarget[] {
  return targets.filter((t) => values[t.method] === null || values[t.method] === undefined);
}

/** Descuadre de la cuenta: suma de (contado − esperado) de lo ya arqueado. */
export function digitalDifference(
  targets: DigitalTarget[],
  values: Record<string, number | null>,
): number {
  return targets.reduce((acc, t) => {
    const counted = values[t.method];
    return counted === null || counted === undefined ? acc : acc + (counted - t.expected);
  }, 0);
}
