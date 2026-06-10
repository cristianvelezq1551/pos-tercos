/**
 * Redondeo monetario canónico del dominio. Dos precisiones DELIBERADAS:
 *
 * - `roundMoney` (2 decimales): montos en COP que se cobran o descuentan al
 *   cliente (descuentos de promociones, totales de línea).
 * - `roundCost` (4 decimales): costos unitarios y valores del ledger FIFO,
 *   donde 2 decimales acumularían error al multiplicar por cantidades
 *   fraccionarias (gramos, ml).
 *
 * No agregar más variantes sin discutir: cualquier otro redondeo de plata
 * debe pasar por una de estas dos.
 */

/** Montos COP cobrados/abonados al cliente — 2 decimales. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Costos unitarios y ledger FIFO — 4 decimales. */
export function roundCost(n: number): number {
  return Math.round(n * 10000) / 10000;
}
