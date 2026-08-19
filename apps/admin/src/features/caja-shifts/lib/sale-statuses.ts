/**
 * Estados donde la venta YA cobró plata (entra a caja y reportes).
 * Excluye PENDIENTE_PAGO (no pagó), CANCELADO_NO_PAGO (nunca pagó) y VOID
 * (reembolsada → neto 0). Incluye CANCELADO_SIN_REEMBOLSO (la plata quedó).
 */
export const PAID_STATUSES: ReadonlySet<string> = new Set([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
  'CANCELADO_SIN_REEMBOLSO',
]);
