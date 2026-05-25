import type { PaymentMethod } from '@pos-tercos/types';
import { offlineDb } from './db';
import type { OfflineSale, OfflineSalePayload } from './types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local YYYY-MM-DD (jornada del contador OFF-N). */
function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Próximo número provisional OFF-N. Reinicia el contador en cada jornada. */
async function nextProvisionalNumber(): Promise<string> {
  const today = localDateStr();
  const meta = await offlineDb.getMeta();
  const n = meta && meta.jornada === today ? meta.offCounter + 1 : 1;
  await offlineDb.setMeta({
    offCounter: n,
    jornada: today,
    lastSyncAt: meta?.lastSyncAt ?? null,
  });
  return `OFF-${n}`;
}

/**
 * Encola una venta offline (COUNTER) en IndexedDB con su número provisional.
 * El `localId` se usará como Idempotency-Key al sincronizar (B.3) → cero
 * doble-cobro si una respuesta se pierde en el reintento.
 */
export async function enqueueOfflineSale(input: {
  payload: OfflineSalePayload;
  payment: { method: PaymentMethod; amountReceived: number; offlineVerified: boolean };
}): Promise<OfflineSale> {
  const sale: OfflineSale = {
    localId: crypto.randomUUID(),
    provisionalNumber: await nextProvisionalNumber(),
    payload: input.payload,
    payment: input.payment,
    soldOfflineAt: new Date().toISOString(),
    status: 'queued',
  };
  await offlineDb.putSale(sale);
  return sale;
}

/** Nombre del cajero desde la sesión cacheada (para el recibo offline). */
export async function getCachedCashierName(): Promise<string | null> {
  const session = await offlineDb.getSession();
  return session?.user?.fullName ?? null;
}
