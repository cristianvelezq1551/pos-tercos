import { SaleSchema, type Sale } from '@pos-tercos/types';

export async function fetchSaleById(saleId: string): Promise<Sale> {
  const res = await fetch(`/api/sales/${saleId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`fetchSaleById ${saleId} failed: ${res.status}`);
  const json = (await res.json()) as unknown;
  return SaleSchema.parse(json);
}
