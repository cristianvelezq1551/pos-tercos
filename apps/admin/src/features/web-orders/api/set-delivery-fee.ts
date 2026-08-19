import { SaleSchema, type Sale } from '@pos-tercos/types';

/**
 * El cajero asigna el costo del envío. El backend recalcula el total y dispara
 * el WhatsApp con el número real (comida + envío).
 */
export async function setDeliveryFee(saleId: string, fee: number): Promise<Sale> {
  const res = await fetch(`/api/sales/${saleId}/delivery-fee`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fee }),
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return SaleSchema.parse(await res.json());
}
