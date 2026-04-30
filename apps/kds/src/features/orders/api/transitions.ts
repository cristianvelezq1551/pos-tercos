import { SaleSchema, type Sale } from '@pos-tercos/types';

async function postTransition(saleId: string, action: 'start' | 'ready'): Promise<Sale> {
  const res = await fetch(`/api/kds/orders/${saleId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return SaleSchema.parse(json);
}

export const startOrder = (saleId: string) => postTransition(saleId, 'start');
export const readyOrder = (saleId: string) => postTransition(saleId, 'ready');
