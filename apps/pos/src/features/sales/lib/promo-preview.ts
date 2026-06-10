import { applyPromotion } from '@pos-tercos/domain';
import type { Promotion } from '@pos-tercos/types';
import { toPromotionDef } from './totals';

export interface ProductPromoBadge {
  /** Texto corto para el chip ("−20%", "−$2.700", "2×1"). */
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
 */
export function getActivePromoBadge(
  productId: string,
  basePrice: number,
  promos: readonly Promotion[],
  at: Date = new Date(),
): ProductPromoBadge | null {
  if (basePrice <= 0) return null;
  const defs = promos.filter((p) => p.isActive).map(toPromotionDef);
  if (defs.length === 0) return null;

  // 1) Probar con qty=1: dispara PERCENT_OFF, FIXED_OFF, COMBO_OFF (no BOGO).
  const r = applyPromotion(
    { productId, lineSubtotal: basePrice, quantity: 1, isCombo: false, at },
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
        discountedPrice: round(basePrice - r.lineDiscount),
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "$2.700" en es-CO sin decimales (más compacto que formatCop). */
function formatCopShort(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CO')}`;
}
