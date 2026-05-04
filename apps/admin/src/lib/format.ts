/**
 * Formatters compartidos. Reemplazan duplicaciones en componentes admin.
 * (FASE 4 ajustes 2.14.)
 */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const NUM4 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

export function formatCop(amount: number): string {
  return COP.format(amount);
}

export function formatNumber(n: number, opts?: { decimals?: number }): string {
  if (opts?.decimals !== undefined) {
    return n.toLocaleString('es-CO', { maximumFractionDigits: opts.decimals });
  }
  return NUM4.format(n);
}

/**
 * Formatos:
 *  - 'short'    → "04 may"
 *  - 'long'     → "04 may 2026"
 *  - 'datetime' → "04 may 2026, 14:32"
 */
export function formatDate(iso: string, format: 'short' | 'long' | 'datetime' = 'long'): string {
  const d = new Date(iso);
  if (format === 'short') {
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }
  if (format === 'datetime') {
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
