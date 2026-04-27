/**
 * Stub del motor de promociones. FASE 5.B no aplica descuentos —
 * cada item devuelve `appliedPromotionId=null` y `discount=0`.
 *
 * El motor real (puro, en `@pos-tercos/domain/promotions`) llega en
 * Sprint 5.C: para cada item evalúa promociones activas (day_of_week_mask
 * + time_start/end + product_id) y aplica la de mayor `discount_pct`.
 * No acumulables.
 */

export interface PromotionResolutionInput {
  productId: string;
  /** Subtotal de la línea YA con tamaño + modifiers aplicados. */
  lineSubtotal: number;
  /** Momento de la venta (para evaluar day-of-week + time window). */
  at: Date;
}

export interface PromotionResolutionOutput {
  appliedPromotionId: string | null;
  /** Monto absoluto de descuento (no fracción). */
  lineDiscount: number;
}

/**
 * Stub: nunca aplica promociones.
 *
 * Uso:
 *   const result = resolvePromotion(input);
 *   // result.appliedPromotionId === null
 *   // result.lineDiscount === 0
 */
export function resolvePromotion(_input: PromotionResolutionInput): PromotionResolutionOutput {
  return { appliedPromotionId: null, lineDiscount: 0 };
}
