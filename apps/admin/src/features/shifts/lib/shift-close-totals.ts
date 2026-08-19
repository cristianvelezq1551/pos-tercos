import type { Shift } from '@pos-tercos/types';

/** Una pata del cierre: lo que debía haber, lo que se contó y la diferencia. */
export interface CloseLeg {
  expected: number | null;
  counted: number | null;
  difference: number | null;
  /** Quedaron medios de cuenta sin arquear — el contado no está completo. */
  partial: boolean;
}

export interface ShiftCloseTotals {
  cash: CloseLeg;
  account: CloseLeg;
  total: CloseLeg;
}

const EMPTY: CloseLeg = { expected: null, counted: null, difference: null, partial: false };

/**
 * Efectivo, cuenta (todo lo que no es efectivo) y total de un turno.
 *
 * `digitalCountBreakdown` solo se persiste si hubo plata digital en el turno:
 * ausente en una caja CERRADA significa cero, no "sin dato". Si el cajero dejó
 * algún medio sin arquear, el contado de cuenta queda `partial` y el total no
 * se calcula (sumar lo que falta daría un faltante inventado).
 */
export function shiftCloseTotals(shift: Shift): ShiftCloseTotals {
  const isClosed = shift.status !== 'OPEN';
  const cash: CloseLeg = {
    expected: shift.expectedCash,
    counted: shift.countedCash,
    difference: shift.difference,
    partial: false,
  };

  const lines = shift.digitalCountBreakdown ?? [];
  let account: CloseLeg;
  if (lines.length === 0) {
    account = isClosed ? { expected: 0, counted: 0, difference: 0, partial: false } : EMPTY;
  } else {
    const expected = lines.reduce((a, l) => a + l.expected, 0);
    const arqueadas = lines.filter((l) => l.counted !== null);
    account =
      arqueadas.length === 0
        ? { expected, counted: null, difference: null, partial: true }
        : {
            expected,
            counted: arqueadas.reduce((a, l) => a + (l.counted ?? 0), 0),
            difference: arqueadas.reduce((a, l) => a + (l.difference ?? 0), 0),
            partial: arqueadas.length < lines.length,
          };
  }

  const bothCounted =
    cash.counted !== null && account.counted !== null && !account.partial;
  const total: CloseLeg = {
    expected:
      cash.expected !== null && account.expected !== null
        ? cash.expected + account.expected
        : null,
    counted: bothCounted ? (cash.counted ?? 0) + (account.counted ?? 0) : null,
    difference: bothCounted ? (cash.difference ?? 0) + (account.difference ?? 0) : null,
    partial: account.partial,
  };

  return { cash, account, total };
}
