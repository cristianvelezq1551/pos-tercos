import { logError } from '../../../lib/client-log';
import { syncOfflineSale } from '../api/sync-offline';
import { syncOfflineShiftOpen } from '../api/sync-offline-shift';
import { offlineDb } from './db';
import { selectDrainable } from './drain-policy';

const DRAIN_LOCK = 'pos-tercos-offline-drain';

/**
 * Vacía la cola de ventas offline contra el backend (FIFO por hora de venta).
 * Se llama al recuperar conexión. Cada venta:
 *  - éxito → status `synced` (+ número/turno reales guardados).
 *  - fallo → status `failed` + razón → bandeja de revisión (B.5); se reintenta
 *    en el próximo drain con backoff hasta MAX_AUTO_SYNC_ATTEMPTS.
 *
 * Exclusión entre pestañas con Web Locks (`navigator.locks`): dos tabs del
 * POS no drenan a la vez (antes solo había un guard por módulo → cada tab
 * drenaba por su cuenta; la idempotencia por localId evitaba el doble cobro
 * pero duplicaba requests y entradas de log). Fallback al guard local si el
 * navegador no soporta locks.
 */
let drainingLocal = false;

export async function drainOfflineQueue(
  onProgress?: () => void,
  opts?: { includeExhausted?: boolean },
): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    await locks.request(DRAIN_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) return; // otra pestaña está drenando — su drain cubre la cola
      await drain(onProgress, opts);
    });
    return;
  }
  if (drainingLocal) return;
  drainingLocal = true;
  try {
    await drain(onProgress, opts);
  } finally {
    drainingLocal = false;
  }
}

/**
 * B.4b: sincroniza la apertura de caja offline pendiente ANTES que las ventas
 * (sin caja en el server, las ventas fallarían a la bandeja). Idempotente por
 * localId → se reintenta en cada drain hasta que entre; un fallo NO bloquea
 * el drain de ventas (si alguien ya abrió caja online, igual se cuelgan de esa).
 */
async function syncPendingShiftOpen(): Promise<void> {
  const open = await offlineDb.getShiftOpen();
  if (!open || open.status === 'synced') return;
  try {
    const res = await syncOfflineShiftOpen(open);
    await offlineDb.setShiftOpen({
      ...open,
      status: 'synced',
      failReason: undefined,
      realShiftId: res.shift.id,
    });
  } catch (err) {
    logError('offline-shift-open-sync', err, { localId: open.localId });
    await offlineDb.setShiftOpen({
      ...open,
      status: 'failed',
      failReason: err instanceof Error ? err.message : String(err),
    });
  }
}

async function drain(
  onProgress?: () => void,
  opts?: { includeExhausted?: boolean },
): Promise<void> {
  await syncPendingShiftOpen();
  const now = Date.now();
  const pending = selectDrainable(await offlineDb.listSales(), now, opts);

  for (const sale of pending) {
    const attempts = (sale.attempts ?? 0) + 1;
    const lastAttemptAt = new Date().toISOString();
    await offlineDb.putSale({
      ...sale,
      status: 'syncing',
      failReason: undefined,
      attempts,
      lastAttemptAt,
    });
    onProgress?.();
    try {
      const real = await syncOfflineSale(sale);
      await offlineDb.putSale({
        ...sale,
        status: 'synced',
        attempts,
        lastAttemptAt,
        realReceiptNumber: real.receiptNumber,
      });
    } catch (err) {
      logError('offline-sync', err, {
        localId: sale.localId,
        provisionalNumber: sale.provisionalNumber,
        attempts,
      });
      await offlineDb.putSale({
        ...sale,
        status: 'failed',
        attempts,
        lastAttemptAt,
        failReason: err instanceof Error ? err.message : String(err),
      });
    }
    onProgress?.();
  }

  if (pending.length > 0) {
    const meta = await offlineDb.getMeta();
    if (meta) await offlineDb.setMeta({ ...meta, lastSyncAt: new Date().toISOString() });
  }
}
