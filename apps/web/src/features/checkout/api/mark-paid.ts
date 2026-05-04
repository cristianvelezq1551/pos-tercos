import {
  PublicWebOrderSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';

export async function markOrderPaid(
  saleId: string,
  token: string,
  reference?: string,
): Promise<PublicWebOrder> {
  const res = await fetch(
    `/api/web/orders/${saleId}/mark-paid?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reference ? { reference } : {}),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return PublicWebOrderSchema.parse(json);
}
