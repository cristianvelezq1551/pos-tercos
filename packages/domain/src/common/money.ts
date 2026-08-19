/**
 * Redondeo monetario canónico del dominio. Dos precisiones DELIBERADAS:
 *
 * - `roundMoney` (PESO ENTERO): montos en COP que se cobran o descuentan al
 *   cliente (descuentos de promociones, totales de línea, totales de venta).
 *   El peso colombiano NO tiene centavos en la operación: un total fraccionario
 *   (ej. 15% de $8.950 = $1.342,50) hacía imposible cuadrar la cuenta dividida
 *   (partes enteras) y rompía el match exacto de la reconciliación bancaria.
 *   Redondear a peso entero es lo idiomático y deja subtotal/descuento/total
 *   coherentes (todos enteros) para el CHECK, el split y el arqueo.
 * - `roundCost` (4 decimales): costos unitarios y valores del ledger FIFO,
 *   donde el peso entero acumularía error al multiplicar por cantidades
 *   fraccionarias (gramos, ml). El COSTO se lleva fino; lo que se COBRA, entero.
 *
 * No agregar más variantes sin discutir: cualquier otro redondeo de plata
 * debe pasar por una de estas dos.
 */

/** Montos COP cobrados/abonados al cliente — PESO ENTERO (COP no tiene centavos). */
export function roundMoney(n: number): number {
  return Math.round(n);
}

/** Costos unitarios y ledger FIFO — 4 decimales. */
export function roundCost(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * True si la cantidad redondea a 0 en Decimal(_,4) (la escala de los movements
 * de inventario). Un consumo despreciable que persistiría como delta=0 violaría
 * el CHECK `delta <> 0` y abortaría toda la tx; conviene descartarlo antes.
 */
export function roundsToZeroAt4(n: number): boolean {
  return roundCost(n) === 0;
}
