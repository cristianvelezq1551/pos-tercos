export { CartPanel } from './components/CartPanel';
export { CheckoutModal, type CheckoutSuccess } from './components/CheckoutModal';
export { useCartStore, cartLinesToCreateItems, type LastSaleSummary } from './store/cart-store';
export { fetchActivePromotions, createSale, confirmPayment } from './api';
export { computeCartTotals, toPromotionDef } from './lib/totals';
export type { CartLine, CartLineSize, CartLineModifier } from './lib/cart-types';
export type { CartLineTotals, CartTotalsResult } from './lib/totals';
