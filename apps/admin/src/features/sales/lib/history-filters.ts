import type { SaleStatus } from '@pos-tercos/types';
import { ACTIVE_SALE_STATUSES, SLOW_ORDER_THRESHOLD_MIN } from './sale-status-mapping';

export interface HistoryFilter {
  key: string;
  label: string;
  match: (s: SaleStatus) => boolean;
}

export const HISTORY_FILTERS: HistoryFilter[] = [
  { key: 'todos', label: 'Todos', match: () => true },
  { key: 'pago', label: 'Pend. pago', match: (s) => s === 'PENDIENTE_PAGO' },
  { key: 'pagados', label: 'Pagados', match: (s) => s === 'PAGADO' },
  // Pedidos web "listos para retirar" (estado terminal del flujo web).
  { key: 'listos', label: 'Listos', match: (s) => s === 'LISTO_DESPACHO' },
  {
    key: 'anulados',
    label: 'Anulados',
    match: (s) => s === 'VOID' || s === 'CANCELADO_NO_PAGO' || s === 'CANCELADO_SIN_REEMBOLSO',
  },
];

const WARN_MIN = 7;

export function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export function isActiveSale(s: SaleStatus): boolean {
  return ACTIVE_SALE_STATUSES.includes(s);
}

export function elapsedTone(minutes: number): string {
  if (minutes >= SLOW_ORDER_THRESHOLD_MIN) return 'text-destructive';
  if (minutes >= WARN_MIN) return 'text-warning';
  return 'text-success';
}
