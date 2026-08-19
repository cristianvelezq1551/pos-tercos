import {
  ChangeSalePaymentSchema,
  EditSaleItemsSchema,
  SaleSchema,
  type ChangeSalePayment,
  type EditSaleItems,
  type Sale,
} from '@pos-tercos/types';

/**
 * Edita los productos de un pedido ya cobrado. El backend valida la regla
 * de cocina (≠ PAGADO → solo reventa directa) y recalcula precios y stock.
 */
export async function editSaleItems(saleId: string, input: EditSaleItems): Promise<Sale> {
  const body = EditSaleItemsSchema.parse(input);
  const res = await fetch(`/api/sales/${saleId}/items`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `editSaleItems failed: ${res.status}`);
  }
  return SaleSchema.parse(await res.json());
}

/** Reclasifica el método/división de pago de una venta cobrada. */
export async function changeSalePayment(
  saleId: string,
  input: ChangeSalePayment,
): Promise<Sale> {
  const body = ChangeSalePaymentSchema.parse(input);
  const res = await fetch(`/api/sales/${saleId}/payment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `changeSalePayment failed: ${res.status}`);
  }
  return SaleSchema.parse(await res.json());
}
