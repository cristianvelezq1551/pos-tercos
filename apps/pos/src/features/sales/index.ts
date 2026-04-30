export { CartPanel } from './components/CartPanel';
export { useCartStore } from './store/cart-store';
export { fetchActivePromotions } from './api';
export { computeCartTotals, toPromotionDef } from './lib/totals';
export type { CartLine, CartLineSize, CartLineModifier } from './lib/cart-types';
export type { CartLineTotals, CartTotalsResult } from './lib/totals';
