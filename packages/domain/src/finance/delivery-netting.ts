/**
 * El envío NUNCA cuenta como plata del negocio (§7.v24 → §7.v30).
 *
 * Al domiciliario se le paga AL ENTREGAR, siempre: cuando la caja cierra, esa
 * plata ya salió de cualquier medio por el que haya entrado. Entonces todo
 * total de caja —efectivo esperado, arqueo de cuenta, byMethod, lo vendido—
 * va NETO del envío.
 *
 * Esta función existe porque la regla vivía copiada en cuatro lugares
 * (`computeExpectedCash`, `computeDigitalExpected` y el resumen de sesión en el
 * server, más `computeShiftSummary` en el admin). Cuando el server pasó a neto
 * y el admin se quedó en bruto, el badge "En caja" y el Z-report mostraron de
 * más exactamente el envío cobrado en efectivo: el cajero veía un número y
 * contaba otro. Una sola fuente evita que vuelva a separarse.
 */

/**
 * Parte del envío que le toca a UN pago de la venta, prorrateada por lo que ese
 * pago aportó al total.
 *
 * En una cuenta dividida 50/50 con $12.000 de envío, cada pago carga $6.000.
 * El `min(1, …)` es defensivo: un pago no puede cargar más envío del que hay.
 *
 * @param paymentAmount lo que aportó ese pago (incluye su parte del envío)
 * @param saleTotal total de la venta (incluye el envío)
 * @param deliveryFee envío cobrado en esa venta (0 si no hubo)
 */
export function deliveryFeeShareOfPayment(
  paymentAmount: number,
  saleTotal: number,
  deliveryFee: number,
): number {
  if (deliveryFee <= 0 || saleTotal <= 0) return 0;
  return deliveryFee * Math.min(1, paymentAmount / saleTotal);
}

/**
 * Lo que de ese pago se queda el negocio: el monto menos su parte del envío.
 * Es el valor que suman `byMethod`, el efectivo esperado y el arqueo de cuenta.
 */
export function netOfDeliveryFee(
  paymentAmount: number,
  saleTotal: number,
  deliveryFee: number,
): number {
  return paymentAmount - deliveryFeeShareOfPayment(paymentAmount, saleTotal, deliveryFee);
}
