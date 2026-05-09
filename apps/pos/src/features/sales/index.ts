export { CartPanel } from './components/CartPanel';
export { CheckoutModal, type CheckoutSuccess } from './components/CheckoutModal';
export { VoidModal } from './components/VoidModal';
export { VoidSaleAction } from './components/VoidSaleAction';
export { useCartStore, cartLinesToCreateItems, type LastSaleSummary } from './store/cart-store';
export {
  fetchActivePromotions,
  createSale,
  confirmPayment,
  printReceipt,
  listSales,
  voidSale,
} from './api';
export { openReceiptWindow } from './lib/open-receipt-window';
export { computeCartTotals, toPromotionDef } from './lib/totals';
export type { CartLine, CartLineSize, CartLineModifier } from './lib/cart-types';
export type { CartLineTotals, CartTotalsResult } from './lib/totals';
