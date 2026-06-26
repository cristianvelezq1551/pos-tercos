import type { PublicMenuProduct } from '@pos-tercos/types';

/**
 * Precio base que se le muestra y cobra al cliente. Un combo cobra `comboPrice`
 * (no `basePrice`, que suele venir en 0 para combos). Fuente única de verdad para
 * picker, card y reconciliación del carrito — el backend usa la misma regla.
 */
export function displayBasePrice(product: PublicMenuProduct): number {
  return product.isCombo && product.comboPrice !== null
    ? product.comboPrice
    : product.basePrice;
}
