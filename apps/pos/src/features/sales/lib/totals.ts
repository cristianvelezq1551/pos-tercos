import { applyPromotion, type PromotionDef } from '@pos-tercos/domain';
import type { Promotion } from '@pos-tercos/types';
import type { CartLine } from './cart-types';

export interface CartLineTotals {
  lineId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  appliedPromotionId: string | null;
  lineDiscount: number;
  lineTotal: number;
}

export interface CartTotalsResult {
  lines: CartLineTotals[];
  subtotal: number;
  discount: number;
  total: number;
}

/** Convierte Promotion (wire) → PromotionDef (dominio). */
export function toPromotionDef(p: Promotion): PromotionDef {
  return {
    id: p.id,
    type: p.type,
    discountPct: p.discountPct ?? undefined,
    discountFixed: p.discountFixed ?? undefined,
    bogoBuyQty: p.bogoBuyQty ?? undefined,
    bogoGetQty: p.bogoGetQty ?? undefined,
    daysOfWeekMask: p.daysOfWeekMask,
    timeStart: p.timeStart,
    timeEnd: p.timeEnd,
    activeFrom: p.activeFrom ? new Date(`${p.activeFrom}T00:00:00`) : null,
    activeTo: p.activeTo ? new Date(`${p.activeTo}T00:00:00`) : null,
    productIds: new Set(p.productIds),
  };
}

export function computeCartTotals(
  items: readonly CartLine[],
  promotions: readonly Promotion[],
  at: Date = new Date(),
): CartTotalsResult {
  const defs = promotions.filter((p) => p.isActive).map(toPromotionDef);

  let subtotal = 0;
  let discount = 0;

  const lines: CartLineTotals[] = items.map((it) => {
    const lineSubtotal = round(it.unitPrice * it.quantity);
    const { appliedPromotionId, lineDiscount } = applyPromotion(
      {
        productId: it.productId,
        lineSubtotal,
        quantity: it.quantity,
        // Cart line del POS hoy no rastrea isCombo per-product. COMBO_OFF
        // no aplica desde POS hasta que el carrito traquee el flag (FASE 12.B).
        isCombo: false,
        at,
      },
      defs,
    );
    const lineTotal = round(lineSubtotal - lineDiscount);
    subtotal += lineSubtotal;
    discount += lineDiscount;
    return {
      lineId: it.lineId,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineSubtotal,
      appliedPromotionId,
      lineDiscount,
      lineTotal,
    };
  });

  return {
    lines,
    subtotal: round(subtotal),
    discount: round(discount),
    total: round(subtotal - discount),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
