import { APPROVAL_PIN_HEADER, SaleSchema, type Sale, type VoidSale } from '@pos-tercos/types';

export async function voidSale(
  saleId: string,
  input: VoidSale,
  approvalPin: string,
): Promise<Sale> {
  const res = await fetch(`/api/sales/${saleId}/void`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [APPROVAL_PIN_HEADER]: approvalPin,
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

/**
 * Reembolsa un pedido que la cocina ya inició (EN_PREPARACION/LISTO/ENTREGADO).
 * No revierte stock (la comida se consumió); requiere PIN de Admin/Dueño.
 */
export async function refundSale(
  saleId: string,
  input: VoidSale,
  approvalPin: string,
): Promise<Sale> {
  const res = await fetch(`/api/sales/${saleId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [APPROVAL_PIN_HEADER]: approvalPin,
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
