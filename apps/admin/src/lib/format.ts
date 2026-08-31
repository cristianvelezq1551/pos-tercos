/**
 * Shim de compatibilidad sobre los formatters canónicos en `@pos-tercos/ui`.
 *
 * Mantiene la API exacta usada por componentes admin (single source of truth
 * vive en packages/ui/src/lib/format.ts).
 *
 * Para nuevos usos, importar directamente desde `@pos-tercos/ui`.
 */
import { BUSINESS_TIME_ZONE, formatCop as fmtCop, formatNumber as fmtNumber } from '@pos-tercos/ui';

export function formatCop(amount: number): string {
  return fmtCop(amount);
}

/**
 * `maxDecimals` recorta los ceros del final (700 en vez de "700,0000") y es lo
 * que se quiere cuando la cantidad es variable: un gramaje puede tener
 * decimales, pero "700,0000 gr de sal" solo agrega ruido a la lectura.
 * `decimals` los fija. Sin opciones se mantienen los 4 fijos de siempre.
 */
export function formatNumber(
  n: number,
  opts?: { decimals?: number; maxDecimals?: number },
): string {
  if (opts?.maxDecimals !== undefined) return fmtNumber(n, { maxDecimals: opts.maxDecimals });
  return fmtNumber(n, { decimals: opts?.decimals ?? 4 });
}

/**
 * Formatos:
 *  - 'short'    → "04 may"   (día + mes corto, sin año)
 *  - 'long'     → "04 may 2026"
 *  - 'datetime' → "04 may 2026, 14:32"
 */
export function formatDate(iso: string, format: 'short' | 'long' | 'datetime' = 'long'): string {
  const d = new Date(iso);
  if (format === 'short') {
    return d.toLocaleDateString('es-CO', {
      timeZone: BUSINESS_TIME_ZONE,
      day: '2-digit',
      month: 'short',
    });
  }
  if (format === 'datetime') {
    return d.toLocaleString('es-CO', {
      timeZone: BUSINESS_TIME_ZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
