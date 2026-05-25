import { syncOfflineSale } from '../api/sync-offline';
import { offlineDb } from './db';

/**
 * Vacía la cola de ventas offline contra el backend (FIFO por hora de venta).
 * Se llama al recuperar conexión. Cada venta:
 *  - éxito → status `synced` (+ número/turno reales guardados).
 *  - fallo → status `failed` + razón → bandeja de revisión (B.5); se reintenta
 *    en el próximo drain (los fallos de red son transitorios).
 *
 * Guard de reentrada: un solo drain a la vez (una pestaña). La idempotencia del
 * backend (por localId) cubre cualquier solape entre pestañas.
 */
let draining = false;

export async function drainOfflineQueue(onProgress?: () => void): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const pending = (await offlineDb.listSales())
      .filter((s) => s.status !== 'synced')
      .sort((a, b) => a.soldOfflineAt.localeCompare(b.soldOfflineAt));

    for (const sale of pending) {
      await offlineDb.putSale({ ...sale, status: 'syncing', failReason: undefined });
      onProgress?.();
      try {
        const real = await syncOfflineSale(sale);
        await offlineDb.putSale({
          ...sale,
          status: 'synced',
          realReceiptNumber: real.receiptNumber,
          realTurnNumber: real.turnNumber ?? undefined,
        });
      } catch (err) {
        await offlineDb.putSale({
          ...sale,
          status: 'failed',
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
