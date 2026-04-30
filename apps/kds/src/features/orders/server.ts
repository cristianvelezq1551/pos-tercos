import { SaleSchema, type Sale } from '@pos-tercos/types';
import { z } from 'zod';
import { serverFetch } from '../../lib/api-server';

const ListSchema = z.array(SaleSchema);

export async function getKitchenQueueServer(): Promise<Sale[]> {
  const res = await serverFetch('/kds/orders');
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as unknown;
  const parsed = ListSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}
