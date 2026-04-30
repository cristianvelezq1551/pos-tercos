import { SaleSchema, type Sale } from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(SaleSchema);

export interface ListSalesParams {
  shiftId?: string;
  status?: string;
  limit?: number;
}

export async function listSales(params: ListSalesParams = {}): Promise<Sale[]> {
  const qs = new URLSearchParams();
  if (params.shiftId) qs.set('shift_id', params.shiftId);
  if (params.status) qs.set('status', params.status);
  if (params.limit) qs.set('limit', String(params.limit));
  const url = qs.size > 0 ? `/api/sales?${qs.toString()}` : '/api/sales';
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`listSales failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ListSchema.parse(json);
}
