import { applyPromotion, getPromoBadge, roundMoney, type PromoBadge } from '@pos-tercos/domain';
import type { Promotion } from '@pos-tercos/types';
import { toPromotionDef } from './totals';

export type ProductPromoBadge = PromoBadge;

/**
 * Devuelve la promo visible en la tarjeta del producto, si hay alguna activa
 * que aplique para él en `at`. Wrapper fino sobre `getPromoBadge` de domain
 * (misma lógica que usa la web pública con el menú online).
 */
export function getActivePromoBadge(
  productId: string,
  basePrice: number,
  promos: readonly Promotion[],
  at: Date = new Date(),
): ProductPromoBadge | null {
  const defs = promos.filter((p) => p.isActive).map(toPromotionDef);
  return getPromoBadge(productId, basePrice, defs, at);
}

/**
 * Descuento (COP) que aplicaría al agregar `quantity` unidades de un producto a
 * `unitPrice` (ya incluye tamaño + modificadores). Mismo motor que el carrito —
 * sirve para previsualizar el precio con descuento en el picker antes de agregar.
 */
export function getLinePromoDiscount(
  productId: string,
  unitPrice: number,
  quantity: number,
  promos: readonly Promotion[],
  at: Date = new Date(),
): number {
  const defs = promos.filter((p) => p.isActive).map(toPromotionDef);
  if (defs.length === 0 || quantity <= 0) return 0;
  const r = applyPromotion(
    {
      productId,
      lineSubtotal: roundMoney(unitPrice * quantity),
      quantity,
      isCombo: false,
      at,
    },
    defs,
  );
  return r.lineDiscount;
}
