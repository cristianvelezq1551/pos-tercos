import type { CashCountLine, CashMovement } from '@pos-tercos/types';

/** Denominaciones COP en circulación (billetes + monedas), de mayor a menor. */
export const COP_DENOMINATIONS = [
  100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50,
] as const;

/** Suma del arqueo: Σ denominación × cantidad. */
export function sumBreakdown(counts: Record<number, number>): number {
  return COP_DENOMINATIONS.reduce((acc, d) => acc + d * (counts[d] ?? 0), 0);
}

/** Convierte el mapa de conteo a las líneas que espera el backend (solo > 0). */
export function toBreakdownLines(counts: Record<number, number>): CashCountLine[] {
  return COP_DENOMINATIONS.filter((d) => (counts[d] ?? 0) > 0).map((d) => ({
    denomination: d,
    count: counts[d] ?? 0,
  }));
}

/** Neto de movimientos de efectivo del turno: entradas − salidas. */
export function cashMovementsNet(movements: CashMovement[]): {
  cashIn: number;
  cashOut: number;
  net: number;
} {
  let cashIn = 0;
  let cashOut = 0;
  for (const m of movements) {
    if (m.type === 'IN') cashIn += m.amount;
    else cashOut += m.amount;
  }
  return { cashIn, cashOut, net: cashIn - cashOut };
}
