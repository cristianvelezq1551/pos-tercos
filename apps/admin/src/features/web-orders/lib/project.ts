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
    deliveryFee: sale.deliveryFee,
    deliveryAddress: sale.deliveryAddress ?? null,
    deliveryNotes: sale.deliveryNotes ?? null,
    notes: sale.notes ?? null,
    createdAt: sale.createdAt,
    items: (sale.items ?? []).map((it) => ({
      productName: it.productName ?? 'Producto',
      sizeName: it.sizeName ?? null,
      quantity: it.quantity,
      // La bebida elegida del combo va junto a las adiciones: el cliente y el
      // cajero tienen que ver QUÉ salió, no solo "1x Combo".
      modifiers: [
        ...(it.modifiers ?? []).map((m) => m.name),
        ...(it.choices ?? []).map((c) => (c.quantity > 1 ? `${c.quantity} ${c.productName}` : c.productName)),
      ],
      notes: it.notes ?? null,
      lineTotal: it.lineTotal,
    })),
  };
}
