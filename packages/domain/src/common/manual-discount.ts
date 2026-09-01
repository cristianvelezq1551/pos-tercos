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
 *
 * `units` es la cantidad de la LÍNEA. Un monto FIJO se descuenta POR CADA UNIDAD,
 * igual que la promoción de monto fijo (`FIXED_OFF`): si no, el precio dependería
 * de cómo se tecleó el pedido —tres bebidas en una línea pagarían −$500 y en tres
 * líneas −$1.500— y la misma compra tendría dos precios. Decisión del dueño,
 * 2026-08-31, la misma que ya se había tomado para las promociones.
 *
 * Para descontar del PEDIDO COMPLETO existe el descuento sobre el total, que es
 * una sola cosa y por eso se llama con `units = 1` (el default).
 *
 * El PORCENTAJE no se toca: ya escala con la base, que incluye la cantidad.
 */
export function manualDiscountAmount(
  base: number,
  spec: ManualDiscountSpec,
  units = 1,
): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(spec.value) || spec.value <= 0) return 0;
  const unidades = Number.isFinite(units) && units > 0 ? units : 1;
  const raw =
    spec.kind === 'PERCENT'
      ? (base * Math.min(spec.value, 100)) / 100
      : spec.value * unidades;
  // Tope: nunca se descuenta más que la base (evita un total negativo).
  return roundMoney(Math.min(raw, base));
}
