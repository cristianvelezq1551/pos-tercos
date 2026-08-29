import {
  applyPromotion,
  getPromoBadge,
  roundMoney,
  type PromoBadge,
  type PromotionDef,
} from '@pos-tercos/domain';
import type { PublicMenuPromotion } from '@pos-tercos/types';

/** Convierte PublicMenuPromotion (wire) → PromotionDef (motor de dominio). */
export function toPromotionDef(p: PublicMenuPromotion): PromotionDef {
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
    activeFrom: p.activeFrom ?? null,
    activeTo: p.activeTo ?? null,
    productIds: new Set(p.productIds),
  };
}

/** Badge de promo para la tarjeta del menú (mismo motor que el POS). */
export function getMenuPromoBadge(
  productId: string,
  displayPrice: number,
  promos: readonly PublicMenuPromotion[],
  at: Date = new Date(),
  isCombo = false,
): PromoBadge | null {
  return getPromoBadge(productId, displayPrice, promos.map(toPromotionDef), at, isCombo);
}

/** Shape mínimo de línea para calcular promos (CartLine lo cumple). */
export interface PromoLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  /** Product.isCombo — sin esto COMBO_OFF nunca se previsualiza. */
  isCombo?: boolean;
}

export interface CartPromoTotals {
  /** Descuento por línea, alineado por índice con las líneas de entrada. */
  lineDiscounts: number[];
  subtotal: number;
  discount: number;
  total: number;
}

/**
 * Preview client-side de los totales con promos del canal web. El monto
 * AUTORITATIVO lo calcula el backend al crear el pedido con el mismo motor;
 * esto solo evita que el cliente vea un precio distinto al que pagará.
 *
 * `isCombo` viaja por línea a propósito: con el flag fijo en false, una promo
 * COMBO_OFF salía cobrada por el backend pero invisible en el menú, el carrito
 * y el checkout — el cliente veía el precio lleno hasta después de pedir.
 */
export function computeCartPromoTotals(
  lines: readonly PromoLine[],
  promos: readonly PublicMenuPromotion[],
  at: Date = new Date(),
): CartPromoTotals {
  const defs = promos.map(toPromotionDef);
  let subtotal = 0;
  let discountSum = 0;
  const lineDiscounts = lines.map((l) => {
    const lineSubtotal = roundMoney(l.unitPrice * l.quantity);
    subtotal += lineSubtotal;
    if (defs.length === 0) return 0;
    const r = applyPromotion(
      {
        productId: l.productId,
        lineSubtotal,
        quantity: l.quantity,
        isCombo: l.isCombo ?? false,
        at,
      },
      defs,
    );
    discountSum += r.lineDiscount;
    return r.lineDiscount;
  });
  const roundedSubtotal = roundMoney(subtotal);
  const discount = roundMoney(discountSum);
  return {
    lineDiscounts,
    subtotal: roundedSubtotal,
    discount,
    total: roundMoney(roundedSubtotal - discount),
  };
}
