import { SaleSchema, type Sale } from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(SaleSchema);

export async function fetchKitchenQueue(): Promise<Sale[]> {
  const res = await fetch('/api/kds/orders', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`fetchKitchenQueue failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ListSchema.parse(json);
}
