import { isWebSaleType, SaleSchema, type Sale } from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(SaleSchema);

/**
 * Lista órdenes web pendientes (PENDIENTE_PAGO + tipos WEB_*). Usa el
 * endpoint /sales con filtros que el cajero ya está autorizado a hit.
 */
export async function fetchPendingWebOrders(): Promise<Sale[]> {
  const params = new URLSearchParams({ status: 'PENDIENTE_PAGO', limit: '50' });
  const res = await fetch(`/api/sales?${params.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`fetchPendingWebOrders failed: ${res.status}`);
  const json = (await res.json()) as unknown;
  const all = ListSchema.parse(json);
  return all.filter((s) => isWebSaleType(s.type));
}
