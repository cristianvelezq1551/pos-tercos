import { SaleSchema, type Sale } from '@pos-tercos/types';
import { z } from 'zod';
import { serverFetch } from '../../lib/api-server';

const ListSchema = z.array(SaleSchema);

export async function getPendingWebOrdersServer(): Promise<Sale[]> {
  const res = await serverFetch('/sales?status=PENDIENTE_PAGO&limit=50');
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as unknown;
  const parsed = ListSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.filter((s) => s.type === 'WEB_PICKUP' || s.type === 'WEB_DELIVERY');
}
