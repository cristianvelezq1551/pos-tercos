import type { Sale } from '@pos-tercos/types';

/**
 * Lentes del listado de ventas: el mismo universo de ventas, mirado por lo que
 * el dueño está buscando en ese momento.
 *
 * Es un filtro de VISTA, no una consulta: la lista ya está cargada, así que
 * cambiar de lente es instantáneo y los totales del pie se recalculan sobre lo
 * que se está viendo (si no, filtrar mostraría 3 ventas y un total de 40).
 */
export type SalesLens = 'todas' | 'descuento' | 'domicilio';

export const SALES_LENSES: { value: SalesLens; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'descuento', label: 'Con descuento' },
  { value: 'domicilio', label: 'Con domicilio' },
];

export function matchesLens(sale: Sale, lens: SalesLens): boolean {
  if (lens === 'descuento') return sale.discountTotal > 0;
  if (lens === 'domicilio') return sale.deliveryFee > 0;
  return true;
}

export interface SalesLensTotals {
  /** Lo que queda en el negocio: siempre neto de domicilio (§7.v24). */
  net: number;
  delivery: number;
  discount: number;
}

export function sumSales(sales: readonly Sale[]): SalesLensTotals {
  return sales.reduce<SalesLensTotals>(
    (acc, s) => ({
      net: acc.net + s.total - s.deliveryFee,
      delivery: acc.delivery + s.deliveryFee,
      discount: acc.discount + s.discountTotal,
    }),
    { net: 0, delivery: 0, discount: 0 },
  );
}
