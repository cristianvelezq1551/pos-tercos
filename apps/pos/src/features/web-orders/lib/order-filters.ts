import type { SaleStatus } from '@pos-tercos/types';

export interface WebFilter {
  key: string;
  label: string;
  match: (s: SaleStatus) => boolean;
}

export const FILTERS: WebFilter[] = [
  { key: 'pago', label: 'Pend. pago', match: (s) => s === 'PENDIENTE_PAGO' },
  { key: 'cocina', label: 'En cocina', match: (s) => s === 'PAGADO' || s === 'EN_PREPARACION' },
  { key: 'listos', label: 'Listos', match: (s) => s === 'LISTO_DESPACHO' },
  { key: 'entregados', label: 'Entregados', match: (s) => s === 'ENTREGADO' },
  { key: 'todos', label: 'Todos', match: () => true },
];
