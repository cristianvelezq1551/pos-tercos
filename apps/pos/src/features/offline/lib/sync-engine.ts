import { logError } from '../../../lib/client-log';
import { syncOfflineSale } from '../api/sync-offline';
import { offlineDb } from './db';

/**
 * Tras N intentos fallidos, el drain AUTOMÁTICO deja de insistir con esa
 * venta (probable rechazo permanente del backend: producto borrado, caja
 * stale). Sigue en la bandeja de revisión, donde el reintento MANUAL la
 * incluye siempre. Evita martillar al backend en cada reconexión.
 */
const MAX_AUTO_SYNC_ATTEMPTS = 5;

/**
 * Backoff entre reintentos automáticos de la MISMA venta: 5s, 15s, 45s,
 * 2m15s (techo 5 min). Una red 4G inestable produce timeouts en ráfaga —
 * sin esto, 5 intentos se queman en segundos y la venta queda "failed"
 * cuando solo había lag.
 */
function backoffMs(attempts: number): number {
  return Math.min(5_000 * 3 ** Math.max(0, attempts - 1), 5 * 60_000);
}

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

async function drain(
  onProgress?: () => void,
  opts?: { includeExhausted?: boolean },
): Promise<void> {
  const now = Date.now();
  const pending = (await offlineDb.listSales())
    .filter((s) => s.status !== 'synced')
    .filter(
      (s) =>
        opts?.includeExhausted ||
        s.status !== 'failed' ||
        (s.attempts ?? 0) < MAX_AUTO_SYNC_ATTEMPTS,
    )
    // Backoff por venta: respetar la espera salvo reintento manual.
    .filter((s) => {
      if (opts?.includeExhausted) return true;
      const last = s.lastAttemptAt ? new Date(s.lastAttemptAt).getTime() : 0;
      return now >= last + (s.attempts ? backoffMs(s.attempts) : 0);
    })
    .sort((a, b) => a.soldOfflineAt.localeCompare(b.soldOfflineAt));

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
        realTurnNumber: real.turnNumber ?? undefined,
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
