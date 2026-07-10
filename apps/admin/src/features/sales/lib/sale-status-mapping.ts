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

/**
 * Estados "activos" que muestran el cronómetro de espera en el historial.
 * Solo PENDIENTE_PAGO: una venta de mostrador PAGADA ya está cerrada (estado
 * terminal) y un pedido web pagado tiene su propio cronómetro en el modal de
 * Pedidos web. Mostrar el timer en PAGADO marcaría toda venta como "tardando".
 */
export const ACTIVE_SALE_STATUSES: SaleStatus[] = ['PENDIENTE_PAGO'];

/** Minutos que un pedido activo puede esperar antes de marcarse "tardando". */
export const SLOW_ORDER_THRESHOLD_MIN = 10;
