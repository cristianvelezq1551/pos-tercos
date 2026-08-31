import { deliveryFeeShareOfPayment, netOfDeliveryFee } from '@pos-tercos/domain';
import type { Sale } from '@pos-tercos/types';

export interface ShiftSummary {
  /**
   * Ventas del turno SIN los domicilios: esa plata es del repartidor y solo
   * pasa por la caja (§7.v24). Mezclarla acá inflaba "total vendido" con algo
   * que el negocio no se queda.
   */
  totalSales: number;
  /** Cantidad de ventas válidas. */
  countSales: number;
  /**
   * Desglose por método: { count, total }. **NETO de domicilio** (§7.v30),
   * prorrateado por la parte que pagó cada medio — igual que
   * `ShiftSessionSummary.byMethod` y que `computeDigitalExpected` en el server.
   * Al repartidor se le paga al entregar, así que al cerrar esa plata ya salió
   * de todos los medios. Invariante: Σ byMethod === totalSales.
   *
   * ⚠️ Esta función es la GEMELA cliente de `ShiftsService`: si cambia la regla
   * del envío en el server, tiene que cambiar acá el mismo día. La divergencia
   * anterior (acá bruto, allá neto) hacía que el badge "En caja" y el Z-report
   * mostraran de más justo el envío cobrado en efectivo.
   */
  byMethod: Record<string, { count: number; total: number }>;
  /**
   * Total cobrado en efectivo NETO de domicilio — lo que debería estar en el
   * cajón sobre la apertura. Mismo número que `computeExpectedCash` del server.
   */
  cashSalesTotal: number;
  /** Domicilios cobrados en el turno (todos los medios). Plata de terceros. */
  deliveryCollected: number;
  /**
   * La parte de los domicilios que entró EN EFECTIVO y por lo tanto está en el
   * cajón. Se separa porque el cajero tiene que saber cuánto de lo que cuenta
   * no es del negocio: se lo va a entregar al repartidor.
   */
  deliveryCashCollected: number;
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
  let deliveryCollected = 0;
  let deliveryCashCollected = 0;

  for (const s of sales) {
    if (s.status === 'VOID') voidCount += 1;
    if (s.status === 'PENDIENTE_PAGO' || s.status === 'VOID' || s.status === 'CANCELADO_NO_PAGO') {
      continue;
    }
    countSales += 1;
    const fee = s.deliveryFee ?? 0;
    totalSales += s.total - fee;
    deliveryCollected += fee;

    // Por método desde los PAGOS (una cuenta dividida aporta a varios métodos).
    const payments =
      s.payments && s.payments.length > 0
        ? s.payments
        : [{ method: s.paymentMethod ?? 'UNKNOWN', amount: s.total }];
    let cashDeLaVenta = 0;
    for (const pay of payments) {
      byMethod[pay.method] ??= { count: 0, total: 0 };
      byMethod[pay.method].count += 1;
      byMethod[pay.method].total += netOfDeliveryFee(pay.amount, s.total, fee);
      if (pay.method === 'CASH') cashDeLaVenta += pay.amount;
    }
    // Cuenta dividida: el envío se prorratea por la porción pagada en efectivo
    // (si pagó mitad y mitad, la mitad del envío se cobró en el cajón).
    deliveryCashCollected += deliveryFeeShareOfPayment(cashDeLaVenta, s.total, fee);
  }

  return {
    totalSales,
    countSales,
    byMethod,
    // Redondeado como `computeExpectedCash` del server, que es contra quien se
    // compara este número en el modal de cierre.
    cashSalesTotal: Math.round(byMethod.CASH?.total ?? 0),
    deliveryCollected,
    deliveryCashCollected: Math.round(deliveryCashCollected),
    voidCount,
  };
}
