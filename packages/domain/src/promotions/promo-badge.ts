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
export interface PromoBadgeContext {
  /** Tamaño elegido: habilita las promos limitadas por variante. */
  sizeId?: string | null;
  /** Precio del producto con su tamaño, sin extras (base del precio fijo). */
  unitBasePrice?: number;
}

export function getPromoBadge(
  productId: string,
  basePrice: number,
  defs: readonly PromotionDef[],
  at: Date = new Date(),
  isCombo = false,
  ctx: PromoBadgeContext = {},
): PromoBadge | null {
  if (basePrice <= 0 || defs.length === 0) return null;

  // 1) Probar con qty=1: dispara PERCENT_OFF, FIXED_OFF, FIXED_PRICE, COMBO_OFF
  //    (no BOGO). `isCombo` habilita COMBO_OFF: sin él, un combo nunca mostraba
  //    su badge. Sin `sizeId` (la tarjeta), una promo limitada a una variante no
  //    aparece: se ve al elegir el tamaño.
  const r = applyPromotion(
    {
      productId,
      lineSubtotal: basePrice,
      quantity: 1,
      isCombo,
      at,
      sizeId: ctx.sizeId,
      unitBasePrice: ctx.unitBasePrice,
    },
    defs,
  );
  if (r.lineDiscount > 0) {
    const winner = defs.find((d) => d.id === r.appliedPromotionId);
    if (winner) {
      return {
        label: discountLabel(winner),
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

/** Texto del chip según el tipo de la promo ganadora. */
function discountLabel(winner: PromotionDef): string {
  if (winner.type === 'PERCENT_OFF' && winner.discountPct != null) {
    return `−${Math.round(winner.discountPct * 100)}%`;
  }
  if (winner.type === 'FIXED_OFF' && winner.discountFixed != null) {
    return `−${formatCopShort(winner.discountFixed)}`;
  }
  if (winner.type === 'COMBO_OFF' && winner.discountPct != null) {
    return `Combo −${Math.round(winner.discountPct * 100)}%`;
  }
  if (winner.type === 'COMBO_OFF' && winner.discountFixed != null) {
    return `Combo −${formatCopShort(winner.discountFixed)}`;
  }
  if (winner.type === 'FIXED_PRICE' && winner.fixedPrice != null) {
    // El cliente entiende "Hoy $22.000", no "−$5.000".
    return `Hoy ${formatCopShort(winner.fixedPrice)}`;
  }
  return '−';
}

/** "$2.700" en es-CO sin decimales (más compacto que formatCop). */
function formatCopShort(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CO')}`;
}
