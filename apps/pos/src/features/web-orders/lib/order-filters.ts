import type { SaleStatus } from '@pos-tercos/types';

export interface WebFilter {
  key: string;
  label: string;
  match: (s: SaleStatus) => boolean;
}

export const FILTERS: WebFilter[] = [
  { key: 'pago', label: 'Pend. pago', match: (s) => s === 'PENDIENTE_PAGO' },
  { key: 'preparar', label: 'Por preparar', match: (s) => s === 'PAGADO' },
  { key: 'listos', label: 'Listos', match: (s) => s === 'LISTO_DESPACHO' },
  { key: 'todos', label: 'Todos', match: () => true },
];
