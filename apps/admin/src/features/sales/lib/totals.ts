import {
  applyPromotion,
  manualDiscountAmount,
  roundMoney,
  type PromotionDef,
} from '@pos-tercos/domain';
import type { ManualDiscount, Promotion, Sale } from '@pos-tercos/types';
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
  /** Descuento total (líneas + sobre el total). */
  discount: number;
  /** Parte del descuento aplicada SOBRE EL TOTAL (#5b). 0 sin descuento manual. */
  orderDiscountAmount: number;
  total: number;
}

/** Descuentos manuales del carrito (#5b). Si hay alguno, las promos se ignoran. */
export interface ManualCartDiscounts {
  lineDiscounts: Record<string, ManualDiscount>;
  orderDiscount: ManualDiscount | null;
}

/**
 * Totales de una venta EXISTENTE (cuenta abierta a cobrar) en el shape que
 * consume el CheckoutModal/split — los montos ya vienen calculados del backend.
 */
export function totalsFromSale(sale: Sale): CartTotalsResult {
  return {
    lines: (sale.items ?? []).map((it) => ({
      lineId: it.id,
      productName: it.productName ?? '(sin nombre)',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineSubtotal: it.lineSubtotal,
      appliedPromotionId: it.appliedPromotionId,
      lineDiscount: it.lineDiscount,
      lineTotal: it.lineTotal,
    })),
    subtotal: sale.subtotal,
    discount: sale.discountTotal,
    orderDiscountAmount: sale.orderDiscountAmount ?? 0,
    total: sale.total,
  };
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
    fixedPrice: p.fixedPrice ?? undefined,
    daysOfWeekMask: p.daysOfWeekMask,
    timeStart: p.timeStart,
    timeEnd: p.timeEnd,
    activeFrom: p.activeFrom ?? null,
    activeTo: p.activeTo ?? null,
    productIds: new Set(p.productIds),
    sizeIdsByProduct: p.sizeIdsByProduct
      ? new Map(Object.entries(p.sizeIdsByProduct).map(([pid, ids]) => [pid, new Set(ids)]))
      : undefined,
  };
}

/**
 * Precio de UNA unidad del producto con su tamaño, sin extras ni recargos: la
 * base del precio fijo. `unitPrice` ya trae extras y recargos sumados, así que
 * se restan (los recargos del combo van por unidad elegida).
 */
export function unitBasePriceOf(line: CartLine): number {
  const extras = line.modifiers.reduce((acc, m) => acc + m.priceDelta, 0);
  const recargos = (line.choices ?? []).reduce((acc, c) => acc + c.priceDelta * c.quantity, 0);
  return roundMoney(line.unitPrice - extras - recargos);
}

export function computeCartTotals(
  items: readonly CartLine[],
  promotions: readonly Promotion[],
  at: Date = new Date(),
  manual?: ManualCartDiscounts,
): CartTotalsResult {
  // Descuento manual (#5b): EXCLUYENTE con promos — espeja la regla del backend.
  const hasManual =
    manual !== undefined &&
    (manual.orderDiscount !== null ||
      items.some((it) => manual.lineDiscounts[it.lineId] !== undefined));
  const defs = hasManual ? [] : promotions.filter((p) => p.isActive).map(toPromotionDef);

  let subtotal = 0;
  let lineDiscountSum = 0;

  const lines: CartLineTotals[] = items.map((it) => {
    const lineSubtotal = roundMoney(it.unitPrice * it.quantity);
    let appliedPromotionId: string | null = null;
    let lineDiscount = 0;
    if (hasManual) {
      const spec = manual!.lineDiscounts[it.lineId];
      lineDiscount = spec ? manualDiscountAmount(lineSubtotal, spec, it.quantity) : 0;
    } else {
      const promo = applyPromotion(
        {
          productId: it.productId,
          lineSubtotal,
          quantity: it.quantity,
          // COMBO_OFF: la línea traquea isCombo desde el catálogo, así el
          // preview del carrito iguala lo que cobra el backend (antes fijo en
          // false → combo sin descuento en pantalla pero cobrado → descuadre).
          isCombo: it.isCombo,
          at,
          // Promos por variante y precio fijo: el tamaño decide y la base es el
          // producto con su tamaño, sin extras — igual que en el servidor.
          sizeId: it.size?.id ?? null,
          unitBasePrice: unitBasePriceOf(it),
        },
        defs,
      );
      appliedPromotionId = promo.appliedPromotionId;
      lineDiscount = promo.lineDiscount;
    }
    const lineTotal = roundMoney(lineSubtotal - lineDiscount);
    subtotal += lineSubtotal;
    lineDiscountSum += lineDiscount;
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

  const roundedSubtotal = roundMoney(subtotal);
  const roundedLineDiscounts = roundMoney(lineDiscountSum);
  const orderDiscountAmount =
    hasManual && manual!.orderDiscount !== null
      ? manualDiscountAmount(
          roundMoney(roundedSubtotal - roundedLineDiscounts),
          manual!.orderDiscount,
        )
      : 0;
  const discount = roundMoney(roundedLineDiscounts + orderDiscountAmount);

  return {
    lines,
    subtotal: roundedSubtotal,
    discount,
    orderDiscountAmount,
    total: roundMoney(roundedSubtotal - discount),
  };
}
