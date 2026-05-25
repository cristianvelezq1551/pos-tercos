import type { ReceiptData } from '@pos-tercos/domain';
import type { Sale } from '@pos-tercos/types';

/**
 * Recibo en datos SIN `business`: lo que el POS le manda al print-agent cuando
 * imprime offline (sin backend). El agent rellena `business` desde su `.env` y
 * rinde los bytes ESC/POS con `renderReceiptEscPos`.
 *
 * Espeja `buildReceiptData` del backend (apps/api/src/sales/sales.service.ts)
 * para que el recibo salga idéntico al online.
 */
export type ReceiptDataInput = Omit<ReceiptData, 'business'>;

export function buildReceiptDataInput(
  sale: Sale,
  opts?: { reprint?: boolean },
): ReceiptDataInput {
  return {
    receiptNumber: sale.receiptNumber,
    turnNumber: sale.turnNumber,
    createdAt: sale.createdAt,
    cashierName: sale.cashierName ?? null,
    customerName: sale.customerName,
    items: (sale.items ?? []).map((it) => ({
      productName: it.productName ?? '(sin nombre)',
      sizeName: it.sizeName ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineSubtotal: it.lineSubtotal,
      lineDiscount: it.lineDiscount,
      lineTotal: it.lineTotal,
      appliedPromotionName: it.appliedPromotionName ?? null,
      modifiers: (it.modifiers ?? []).map((m) => ({
        name: m.name,
        priceDelta: m.priceDelta,
      })),
    })),
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    total: sale.total,
    reprintLabel: opts?.reprint ? 'DUPLICADO' : null,
    // En efectivo el print abre el cajón (RJ-11). En transferencia no hace falta.
    openDrawer: sale.paymentMethod === 'CASH',
  };
}
