import type { Sale } from '@pos-tercos/types';

export interface ShiftSummary {
  /** Suma de ventas válidas (pagadas, no anuladas). */
  totalSales: number;
  /** Cantidad de ventas válidas. */
  countSales: number;
  /** Desglose por método: { count, total }. */
  byMethod: Record<string, { count: number; total: number }>;
  /** Total cobrado en efectivo (lo que debería estar en el cajón + apertura). */
  cashSalesTotal: number;
  /** Cantidad de ventas anuladas en el set. */
  voidCount: number;
}

/**
 * Resume las ventas de un turno. Excluye PENDIENTE_PAGO / VOID /
 * CANCELADO_NO_PAGO del total (no son ingresos reales), pero cuenta los VOID
 * aparte para mostrarlos.
 */
export function computeShiftSummary(sales: Sale[]): ShiftSummary {
  const byMethod: Record<string, { count: number; total: number }> = {};
  let totalSales = 0;
  let countSales = 0;
  let voidCount = 0;

  for (const s of sales) {
    if (s.status === 'VOID') voidCount += 1;
    if (
      s.status === 'PENDIENTE_PAGO' ||
      s.status === 'VOID' ||
      s.status === 'CANCELADO_NO_PAGO'
    ) {
      continue;
    }
    countSales += 1;
    totalSales += s.total;
    const method = s.paymentMethod ?? 'UNKNOWN';
    byMethod[method] ??= { count: 0, total: 0 };
    byMethod[method].count += 1;
    byMethod[method].total += s.total;
  }

  return {
    totalSales,
    countSales,
    byMethod,
    cashSalesTotal: byMethod.CASH?.total ?? 0,
    voidCount,
  };
}
