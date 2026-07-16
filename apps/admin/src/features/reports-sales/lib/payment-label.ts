import { PAYMENT_METHOD_LABELS, type PaymentMethod, type Sale } from '@pos-tercos/types';

/**
 * Label del método. Los medios de pago son dinámicos (§7.v16): un método
 * custom cae a su `code` acá — el nombre vivo solo se resuelve en el cobro.
 */
export const methodLabel = (m: string): string =>
  PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m;

/** Resumen del pago de una venta (o "Dividida" si tuvo varias partes). */
export function paymentSummary(sale: Sale): string {
  if (sale.payments && sale.payments.length > 1) {
    return `Dividida · ${sale.payments.map((p) => methodLabel(p.method)).join(' + ')}`;
  }
  const single = sale.paymentMethod ?? sale.payments?.[0]?.method;
  return single ? methodLabel(single) : '—';
}
