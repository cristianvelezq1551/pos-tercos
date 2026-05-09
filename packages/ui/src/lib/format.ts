/**
 * Formatters canónicos para POS Tercos. Single source of truth — NO duplicar
 * en cada app. Usá estos helpers en cualquier lugar que renderice plata,
 * números, fechas u horas.
 */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const COP_NO_SYMBOL = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const NUM_FRACTION = (decimals: number) =>
  new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

/**
 * Formatea pesos colombianos. Acepta number o string (parsea).
 * `withSymbol = false` omite "$" — útil cuando el contexto ya lo deja claro.
 */
export function formatCop(amount: number | string | null | undefined, opts?: { withSymbol?: boolean }): string {
  if (amount == null || amount === '') return '—';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '—';
  const fmt = opts?.withSymbol === false ? COP_NO_SYMBOL : COP;
  return fmt.format(n);
}

/**
 * Formatea un número con cantidad fija de decimales y locale es-CO.
 */
export function formatNumber(
  value: number | null | undefined,
  opts?: { decimals?: number },
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return NUM_FRACTION(opts?.decimals ?? 0).format(value);
}

/**
 * Formatea porcentaje. `value` ya en % (no en 0–1). Ej: formatPercent(15.6) → "15,6 %".
 */
export function formatPercent(
  value: number | null | undefined,
  opts?: { decimals?: number; withSign?: boolean },
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = opts?.withSign && value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, { decimals: opts?.decimals ?? 1 })} %`;
}

export type DateFormat = 'short' | 'long' | 'datetime' | 'time' | 'time-short' | 'relative';

/**
 * Formatea fechas. Acepta Date o string ISO.
 *
 * - `short`: 04 may 2026
 * - `long`: lunes 04 de mayo 2026
 * - `datetime`: 04 may 2026 14:32
 * - `time`: 14:32:18
 * - `time-short`: 14:32
 * - `relative`: "hace 5 min" / "en 2 h"
 */
export function formatDate(value: Date | string | null | undefined, format: DateFormat = 'short'): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  switch (format) {
    case 'short':
      return new Intl.DateTimeFormat('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(d);
    case 'long':
      return new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(d);
    case 'datetime':
      return new Intl.DateTimeFormat('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    case 'time':
      return new Intl.DateTimeFormat('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(d);
    case 'time-short':
      return new Intl.DateTimeFormat('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    case 'relative':
      return formatRelative(d);
  }
}

const RELATIVE = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });

function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return RELATIVE.format(diffSec, 'second');
  if (absSec < 3600) return RELATIVE.format(Math.round(diffSec / 60), 'minute');
  if (absSec < 86400) return RELATIVE.format(Math.round(diffSec / 3600), 'hour');
  if (absSec < 86400 * 30) return RELATIVE.format(Math.round(diffSec / 86400), 'day');
  if (absSec < 86400 * 365) return RELATIVE.format(Math.round(diffSec / (86400 * 30)), 'month');
  return RELATIVE.format(Math.round(diffSec / (86400 * 365)), 'year');
}

/**
 * Formatea milisegundos como "mm:ss" (cronómetro corto) o "h:mm:ss" si > 1h.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
