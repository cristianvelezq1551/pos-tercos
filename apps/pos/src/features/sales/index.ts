export { CartPanel } from './components/CartPanel';
export { CheckoutModal, type CheckoutSuccess } from './components/CheckoutModal';
export { TransferSection } from './components/TransferSection';
export { VoidModal } from './components/VoidModal';
export { VoidSaleAction } from './components/VoidSaleAction';
export { DayHistoryPanel } from './components/DayHistoryPanel';
export { useCartStore, cartLinesToCreateItems, type LastSaleSummary } from './store/cart-store';
export {
  fetchActivePromotions,
  createSale,
  confirmPayment,
  printReceipt,
  listSales,
  voidSale,
} from './api';
export { computeCartTotals, toPromotionDef } from './lib/totals';
export {
  SALE_STATUS_MAPPING,
  ACTIVE_SALE_STATUSES,
  SLOW_ORDER_THRESHOLD_MIN,
} from './lib/sale-status-mapping';
export type { CartLine, CartLineSize, CartLineModifier } from './lib/cart-types';
export type { CartLineTotals, CartTotalsResult } from './lib/totals';
