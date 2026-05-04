import {
  PublicWebOrderSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';

export async function getWebOrder(saleId: string, token: string): Promise<PublicWebOrder> {
  const res = await fetch(
    `/api/web/orders/${saleId}?token=${encodeURIComponent(token)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(`Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return PublicWebOrderSchema.parse(json);
}
