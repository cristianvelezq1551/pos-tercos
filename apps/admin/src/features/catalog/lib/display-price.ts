import type { Product } from '@pos-tercos/types';

/**
 * Precio unitario de partida del producto, ANTES de tamaño y modificadores.
 *
 * Un combo con `comboPrice` no se cobra por `basePrice`: el backend usa el
 * precio del combo (`computeLine` en sales.service). La caja mostraba y
 * previsualizaba `basePrice`, así que en esos productos el precio en pantalla
 * —y el descuento de la promo calculado sobre él— no eran los que se cobraban.
 *
 * La web ya lo hacía bien (`apps/web/src/lib/menu-price.ts`); esta es la misma
 * regla del lado de la caja.
 */
export function displayBasePrice(product: Pick<Product, 'isCombo' | 'comboPrice' | 'basePrice'>): number {
  return product.isCombo && product.comboPrice !== null ? product.comboPrice : product.basePrice;
}
