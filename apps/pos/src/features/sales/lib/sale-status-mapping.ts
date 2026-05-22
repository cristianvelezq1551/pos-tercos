import type { SaleStatus } from '@pos-tercos/types';
import type { StatusMapping } from '@pos-tercos/ui';

/** status → { label, tone } para el StatusBadge del historial del cajero. */
export const SALE_STATUS_MAPPING: StatusMapping<SaleStatus> = {
  PENDIENTE_PAGO: { label: 'Pendiente pago', tone: 'warning' },
  PAGADO: { label: 'Pagado', tone: 'info' },
  EN_PREPARACION: { label: 'En cocina', tone: 'primary', pulse: true },
  LISTO_DESPACHO: { label: 'Listo', tone: 'success' },
  ENTREGADO: { label: 'Entregado', tone: 'neutral' },
  CANCELADO_NO_PAGO: { label: 'Cancelado', tone: 'danger' },
  CANCELADO_SIN_REEMBOLSO: { label: 'Cancelado s/reembolso', tone: 'danger' },
  VOID: { label: 'Anulado', tone: 'danger' },
};

/** Estados "activos" que pueden estar tardando (para la alerta >10 min). */
export const ACTIVE_SALE_STATUSES: SaleStatus[] = [
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_PREPARACION',
];

/** Minutos que un pedido activo puede esperar antes de marcarse "tardando". */
export const SLOW_ORDER_THRESHOLD_MIN = 10;
