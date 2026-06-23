import type { OfflineSale } from './types';

/**
 * Tras N intentos fallidos, el drain AUTOMÁTICO deja de insistir con esa venta
 * (probable rechazo permanente: producto borrado, caja stale). Sigue en la
 * bandeja de revisión; el reintento MANUAL la incluye siempre.
 */
export const MAX_AUTO_SYNC_ATTEMPTS = 5;

/**
 * Backoff entre reintentos automáticos de la MISMA venta: 5s, 15s, 45s,
 * 2m15s (techo 5 min). Una red inestable produce timeouts en ráfaga — sin
 * esto, 5 intentos se queman en segundos y la venta queda "failed" por lag.
 */
export function backoffMs(attempts: number): number {
  return Math.min(5_000 * 3 ** Math.max(0, attempts - 1), 5 * 60_000);
}

/**
 * Selecciona y ordena las ventas a sincronizar en este drain (pura, sin IO):
 *  - excluye las ya `synced`,
 *  - excluye las `failed` que agotaron MAX_AUTO_SYNC_ATTEMPTS (salvo manual),
 *  - respeta el backoff por venta (salvo manual),
 *  - FIFO por hora de venta (`soldOfflineAt`).
 * `includeExhausted` (reintento manual de la bandeja) ignora cota y backoff.
 */
export function selectDrainable(
  sales: readonly OfflineSale[],
  now: number,
  opts?: { includeExhausted?: boolean },
): OfflineSale[] {
  const manual = opts?.includeExhausted ?? false;
  return sales
    .filter((s) => s.status !== 'synced')
    .filter(
      (s) => manual || s.status !== 'failed' || (s.attempts ?? 0) < MAX_AUTO_SYNC_ATTEMPTS,
    )
    .filter((s) => {
      if (manual) return true;
      const last = s.lastAttemptAt ? new Date(s.lastAttemptAt).getTime() : 0;
      return now >= last + (s.attempts ? backoffMs(s.attempts) : 0);
    })
    .sort((a, b) => a.soldOfflineAt.localeCompare(b.soldOfflineAt));
}
