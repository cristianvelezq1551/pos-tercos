import type { ReceiptData } from '@pos-tercos/domain';
import type { PaymentMethod, Promotion, Sale } from '@pos-tercos/types';
import type { OfflineSalePayload } from '../../offline';
import type { CartLine } from './cart-types';
import type { CartTotalsResult } from './totals';

/**
 * Recibo en datos SIN `business`: lo que el POS le manda al print-agent cuando
 * imprime offline (sin backend). El agent rellena `business` desde su `.env` y
 * rinde los bytes ESC/POS con `renderReceiptEscPos`.
 *
 * Espeja `buildReceiptData` del backend (apps/api/src/sales/sales.service.ts)
 * para que el recibo salga idéntico al online.
 */
export type ReceiptDataInput = Omit<ReceiptData, 'business'>;

export function buildReceiptDataInput(sale: Sale, opts?: { reprint?: boolean }): ReceiptDataInput {
  return {
    receiptNumber: sale.receiptNumber,
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

// ====================================================================
// OFFLINE (B.2) — payload verbatim + recibo provisional desde el carrito
// ====================================================================

/** Payload de la venta offline (totales VERBATIM) para encolar + sincronizar. */
export function buildOfflinePayload(
  cartLines: readonly CartLine[],
  totals: CartTotalsResult,
): OfflineSalePayload {
  return {
    type: 'COUNTER',
    customerName: null,
    lines: cartLines.map((line) => {
      const t = totals.lines.find((l) => l.lineId === line.lineId);
      return {
        productId: line.productId,
        sizeId: line.size?.id ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        modifiers: line.modifiers.map((m) => ({
          modifierId: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
        })),
        notes: line.notes ?? null,
        lineSubtotal: t?.lineSubtotal ?? line.unitPrice * line.quantity,
        lineDiscount: t?.lineDiscount ?? 0,
        lineTotal: t?.lineTotal ?? line.unitPrice * line.quantity,
        appliedPromotionId: t?.appliedPromotionId ?? null,
      };
    }),
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
  };
}

/** Recibo provisional (OFF-N) desde el carrito — para imprimir offline. */
export function buildOfflineReceiptInput(
  cartLines: readonly CartLine[],
  totals: CartTotalsResult,
  promotions: readonly Promotion[],
  opts: { provisionalNumber: string; cashierName: string | null; paymentMethod: PaymentMethod },
): ReceiptDataInput {
  const promoName = (id: string | null): string | null =>
    id ? (promotions.find((p) => p.id === id)?.name ?? null) : null;
  return {
    receiptNumber: 0,
    provisionalNumber: opts.provisionalNumber,
    createdAt: new Date().toISOString(),
    cashierName: opts.cashierName,
    customerName: null,
    items: cartLines.map((line) => {
      const t = totals.lines.find((l) => l.lineId === line.lineId);
      return {
        productName: line.productName,
        sizeName: line.size?.name ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineSubtotal: t?.lineSubtotal ?? 0,
        lineDiscount: t?.lineDiscount ?? 0,
        lineTotal: t?.lineTotal ?? 0,
        appliedPromotionName: promoName(t?.appliedPromotionId ?? null),
        modifiers: line.modifiers.map((m) => ({ name: m.name, priceDelta: m.priceDelta })),
      };
    }),
    subtotal: totals.subtotal,
    discountTotal: totals.discount,
    total: totals.total,
    reprintLabel: null,
    openDrawer: opts.paymentMethod === 'CASH',
  };
}
