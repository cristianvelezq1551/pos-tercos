import { IDEMPOTENCY_HEADER, SaleSchema, type CreateSale, type Sale } from '@pos-tercos/types';

export async function createSale(input: CreateSale, idempotencyKey: string): Promise<Sale> {
  const res = await fetch('/api/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return SaleSchema.parse(json);
}
