import { SaleSchema, type Sale } from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(SaleSchema);

export interface ListSalesParams {
  shiftId?: string;
  status?: string;
  type?: string;
  /** ISO datetime — límite inferior (createdAt). */
  from?: string;
  /** ISO datetime — límite superior (createdAt). */
  to?: string;
  limit?: number;
}

export async function listSales(params: ListSalesParams = {}): Promise<Sale[]> {
  const qs = new URLSearchParams();
  if (params.shiftId) qs.set('shift_id', params.shiftId);
  if (params.status) qs.set('status', params.status);
  if (params.type) qs.set('type', params.type);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.limit) qs.set('limit', String(params.limit));
  const url = qs.size > 0 ? `/api/sales?${qs.toString()}` : '/api/sales';
  // Timeout: un fetch colgado dejaba el guard inFlight de usePolling tomado
  // para siempre → el panel de pedidos dejaba de refrescar en silencio.
  const res = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`listSales failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ListSchema.parse(json);
}
