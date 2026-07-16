import { isWebSaleType, type PublicWebOrder, type Sale } from '@pos-tercos/types';

/** Proyecta un Sale (full) al subset PublicWebOrder para uniformar el state. */
export function saleToPublicWebOrder(sale: Sale): PublicWebOrder | null {
  // Los dos tipos web: un domicilio también entra al panel de pedidos del cajero.
  if (!isWebSaleType(sale.type)) return null;
  return {
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    type: sale.type,
    status: sale.status,
    customerName: sale.customerName ?? '',
    customerPhone: sale.customerPhone ?? '',
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    total: sale.total,
    deliveryAddress: sale.deliveryAddress ?? null,
    deliveryNotes: sale.deliveryNotes ?? null,
    createdAt: sale.createdAt,
    items: (sale.items ?? []).map((it) => ({
      productName: it.productName ?? 'Producto',
      sizeName: it.sizeName ?? null,
      quantity: it.quantity,
      modifiers: (it.modifiers ?? []).map((m) => m.name),
      notes: it.notes ?? null,
      lineTotal: it.lineTotal,
    })),
  };
}
