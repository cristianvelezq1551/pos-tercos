import { roundMoney } from '../common/money';
import { applyPromotion } from './apply-promotions';
import type { PromotionDef } from './types';

export interface PromoBadge {
  /** Texto corto para el chip ("−20%", "−$2.700", "Compra 2 lleva 3"). */
  label: string;
  /** 'discount' = % o monto fijo · 'bogo' = lleva X paga Y. Define el color. */
  kind: 'discount' | 'bogo';
  /** Precio final con descuento aplicado, si corresponde (para mostrar el tachado). */
  discountedPrice: number | null;
}

/**
 * Devuelve la promo visible en la tarjeta del producto, si hay alguna activa
 * que aplique para él en `at`. Usa el mismo `applyPromotion` del carrito para
 * mostrar exactamente la promo que ganará al venderlo, no una distinta.
 * El llamador pre-filtra las defs por canal/isActive antes de pasarlas.
 */
export function getPromoBadge(
  productId: string,
  basePrice: number,
  defs: readonly PromotionDef[],
  at: Date = new Date(),
  isCombo = false,
): PromoBadge | null {
  if (basePrice <= 0 || defs.length === 0) return null;

  // 1) Probar con qty=1: dispara PERCENT_OFF, FIXED_OFF, COMBO_OFF (no BOGO).
  //    `isCombo` habilita COMBO_OFF: sin él, un combo nunca mostraba su badge.
  const r = applyPromotion(
    { productId, lineSubtotal: basePrice, quantity: 1, isCombo, at },
    defs,
  );
  if (r.lineDiscount > 0) {
    const winner = defs.find((d) => d.id === r.appliedPromotionId);
    if (winner) {
      let label = '−';
      if (winner.type === 'PERCENT_OFF' && winner.discountPct != null) {
        label = `−${Math.round(winner.discountPct * 100)}%`;
      } else if (winner.type === 'FIXED_OFF' && winner.discountFixed != null) {
        label = `−${formatCopShort(winner.discountFixed)}`;
      } else if (winner.type === 'COMBO_OFF' && winner.discountPct != null) {
        label = `Combo −${Math.round(winner.discountPct * 100)}%`;
      } else if (winner.type === 'COMBO_OFF' && winner.discountFixed != null) {
        label = `Combo −${formatCopShort(winner.discountFixed)}`;
      }
      return {
        label,
        kind: 'discount',
        discountedPrice: roundMoney(basePrice - r.lineDiscount),
      };
    }
  }

  // 2) Fallback: BOGO activo para este producto (no dispara a qty=1).
  //    Probamos cada BOGO matching con la qty mínima que lo activa.
  const bogos = defs.filter((d) => d.type === 'BOGO' && d.productIds.has(productId));
  for (const b of bogos) {
    if (!b.bogoBuyQty || !b.bogoGetQty) continue;
    const minQty = b.bogoBuyQty + b.bogoGetQty;
    const triggered = applyPromotion(
      { productId, lineSubtotal: basePrice * minQty, quantity: minQty, isCombo: false, at },
      [b],
    );
    if (triggered.lineDiscount > 0) {
      return {
        label: `Compra ${b.bogoBuyQty} lleva ${minQty}`,
        kind: 'bogo',
        discountedPrice: null,
      };
    }
  }

  return null;
}

/** "$2.700" en es-CO sin decimales (más compacto que formatCop). */
function formatCopShort(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CO')}`;
}
