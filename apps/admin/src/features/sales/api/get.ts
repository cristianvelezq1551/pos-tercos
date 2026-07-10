import { SaleSchema, type Sale } from '@pos-tercos/types';

export async function getSale(saleId: string): Promise<Sale> {
  const res = await fetch(`/api/sales/${saleId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`getSale failed: ${res.status}`);
  return SaleSchema.parse(await res.json());
}
