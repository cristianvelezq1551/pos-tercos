import type { PaymentMethod } from '@pos-tercos/types';
import { randomUUID } from '../../../lib/uuid';
import { offlineDb } from './db';
import { applyConsumptionForSale } from './offline-availability';
import type { OfflineSale, OfflineSalePayload } from './types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local YYYY-MM-DD (jornada del contador OFF-N). */
function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Próximo número provisional OFF-N. Reinicia el contador SOLO cuando la jornada
 * AVANZA (today > jornada guardada), nunca hacia atrás: si el reloj de la
 * tablet retrocede cruzando medianoche, seguimos incrementando para no duplicar
 * un OFF-N ya impreso/encolado (la unicidad real la garantiza el localId UUID,
 * pero el número impreso no debe colisionar). La jornada guardada es siempre la
 * fecha más avanzada vista.
 */
async function nextProvisionalNumber(): Promise<string> {
  const today = localDateStr();
  const meta = await offlineDb.getMeta();
  const advanced = !meta || today > meta.jornada;
  const n = advanced ? 1 : meta.offCounter + 1;
  await offlineDb.setMeta({
    offCounter: n,
    jornada: advanced ? today : meta.jornada,
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
    localId: randomUUID(),
    provisionalNumber: await nextProvisionalNumber(),
    payload: input.payload,
    payment: input.payment,
    soldOfflineAt: new Date().toISOString(),
    status: 'queued',
  };
  await offlineDb.putSale(sale);
  // Descuenta el consumo del ledger local → la disponibilidad offline se
  // actualiza para las próximas ventas (un preparado se agota offline).
  await applyConsumptionForSale(input.payload);
  return sale;
}

/** Nombre del cajero desde la sesión cacheada (para el recibo offline). */
export async function getCachedCashierName(): Promise<string | null> {
  const session = await offlineDb.getSession();
  return session?.user?.fullName ?? null;
}
