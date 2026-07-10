import { PAYMENT_METHOD_LABELS, type PaymentMethod, type SaleStatus } from '@pos-tercos/types';

/** Pedido vivo en el local: aún se puede corregir (incluye sin pagar). */
export const EDITABLE_STATUSES = new Set<SaleStatus>([
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
]);
export const PAYMENT_CHANGE_STATUSES = new Set<SaleStatus>([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
]);
/** Solo desde PAGADO en adelante hay recibo para imprimir. */
export const PRINTABLE_STATUSES = new Set<SaleStatus>([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
]);
/** Reembolso: pedido web ya retirado (LISTO_DESPACHO) o históricos de cocina. */
export const REFUNDABLE_STATUSES = new Set<SaleStatus>([
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
]);

export function methodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}
