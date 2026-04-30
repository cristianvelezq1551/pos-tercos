import { SaleSchema, type ConfirmPayment, type Sale } from '@pos-tercos/types';

export async function confirmPayment(saleId: string, input: ConfirmPayment): Promise<Sale> {
  const res = await fetch(`/api/sales/${saleId}/confirm-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
