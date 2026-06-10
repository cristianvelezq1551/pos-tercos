import { syncOfflineSale } from '../api/sync-offline';
import { offlineDb } from './db';

/**
 * Tras N intentos fallidos, el drain AUTOMÁTICO deja de insistir con esa
 * venta (probable rechazo permanente del backend: producto borrado, caja
 * stale). Sigue en la bandeja de revisión, donde el reintento MANUAL la
 * incluye siempre. Evita martillar al backend en cada reconexión.
 */
const MAX_AUTO_SYNC_ATTEMPTS = 3;

/**
 * Vacía la cola de ventas offline contra el backend (FIFO por hora de venta).
 * Se llama al recuperar conexión. Cada venta:
 *  - éxito → status `synced` (+ número/turno reales guardados).
 *  - fallo → status `failed` + razón → bandeja de revisión (B.5); se reintenta
 *    en el próximo drain hasta MAX_AUTO_SYNC_ATTEMPTS (los fallos de red son
 *    transitorios; los rechazos del backend no).
 *
 * Guard de reentrada: un solo drain a la vez (una pestaña). La idempotencia del
 * backend (por localId) cubre cualquier solape entre pestañas.
 */
let draining = false;

export async function drainOfflineQueue(
  onProgress?: () => void,
  opts?: { includeExhausted?: boolean },
): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const pending = (await offlineDb.listSales())
      .filter((s) => s.status !== 'synced')
      .filter(
        (s) =>
          opts?.includeExhausted ||
          s.status !== 'failed' ||
          (s.attempts ?? 0) < MAX_AUTO_SYNC_ATTEMPTS,
      )
      .sort((a, b) => a.soldOfflineAt.localeCompare(b.soldOfflineAt));

    for (const sale of pending) {
      const attempts = (sale.attempts ?? 0) + 1;
      await offlineDb.putSale({ ...sale, status: 'syncing', failReason: undefined, attempts });
      onProgress?.();
      try {
        const real = await syncOfflineSale(sale);
        await offlineDb.putSale({
          ...sale,
          status: 'synced',
          attempts,
          realReceiptNumber: real.receiptNumber,
          realTurnNumber: real.turnNumber ?? undefined,
        });
      } catch (err) {
        await offlineDb.putSale({
          ...sale,
          status: 'failed',
          attempts,
          failReason: err instanceof Error ? err.message : String(err),
        });
      }
      onProgress?.();
    }

    if (pending.length > 0) {
      const meta = await offlineDb.getMeta();
      if (meta) await offlineDb.setMeta({ ...meta, lastSyncAt: new Date().toISOString() });
    }
  } finally {
    draining = false;
  }
}
