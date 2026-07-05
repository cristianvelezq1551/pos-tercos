/**
 * Descuento manual (#5b) — cálculo puro compartido por API y POS para que
 * el preview del carrito y lo persistido no diverjan jamás.
 *
 * Reglas:
 *  - FIXED: monto en COP, capado a la base (nunca deja la línea/total en negativo).
 *  - PERCENT: 0 < value <= 100 sobre la base.
 *  - EXCLUYENTE con promociones: si la venta trae CUALQUIER descuento manual,
 *    las promos automáticas se ignoran por completo (decisión cerrada).
 */

import { roundMoney } from './money';

export type ManualDiscountKind = 'FIXED' | 'PERCENT';

export interface ManualDiscountSpec {
  kind: ManualDiscountKind;
  value: number;
}

/**
 * Monto de descuento resultante sobre `base` (subtotal de línea, o total tras
 * descuentos de línea). Siempre en [0, base]; 0 si la base no es positiva o el
 * value no es un número válido positivo.
 */
export function manualDiscountAmount(base: number, spec: ManualDiscountSpec): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(spec.value) || spec.value <= 0) return 0;
  const raw = spec.kind === 'PERCENT' ? (base * Math.min(spec.value, 100)) / 100 : spec.value;
  return roundMoney(Math.min(raw, base));
}
