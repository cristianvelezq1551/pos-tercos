import type { PublicWebOrder, Sale } from '@pos-tercos/types';

/** Proyecta un Sale (full) al subset PublicWebOrder para uniformar el state. */
export function saleToPublicWebOrder(sale: Sale): PublicWebOrder | null {
  if (sale.type !== 'WEB_PICKUP') return null;
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
    createdAt: sale.createdAt,
  };
}
