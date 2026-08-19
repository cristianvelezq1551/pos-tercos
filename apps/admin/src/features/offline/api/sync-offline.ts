import { SaleSchema, type Sale } from '@pos-tercos/types';
import type { OfflineSale } from '../lib/types';

/**
 * Sincroniza UNA venta offline con el backend. El `localId` viaja como
 * idempotency key (lo usa el backend para no doble-cobrar en reintentos).
 * Devuelve la venta real (con receiptNumber asignado).
 */
export async function syncOfflineSale(sale: OfflineSale): Promise<Sale> {
  const res = await fetch('/api/sales/sync-offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      localId: sale.localId,
      provisionalNumber: sale.provisionalNumber,
      soldOfflineAt: sale.soldOfflineAt,
      payment: sale.payment,
      payload: sale.payload,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return SaleSchema.parse(await res.json());
}
