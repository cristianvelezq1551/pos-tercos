import type { SaleStatus } from '@pos-tercos/types';

export interface WebFilter {
  key: string;
  label: string;
  match: (s: SaleStatus) => boolean;
}

export const FILTERS: WebFilter[] = [
  { key: 'pago', label: 'Pend. pago', match: (s) => s === 'PENDIENTE_PAGO' },
  { key: 'preparar', label: 'Por preparar', match: (s) => s === 'PAGADO' },
  // Mismo estado, dos lecturas: el de recoger espera en el mostrador y el
  // domicilio va en la moto. El cajero cierra este último con "Marcar entregado".
  { key: 'listos', label: 'Listos / en camino', match: (s) => s === 'LISTO_DESPACHO' },
  { key: 'entregados', label: 'Entregados', match: (s) => s === 'ENTREGADO' },
  { key: 'todos', label: 'Todos', match: () => true },
];
