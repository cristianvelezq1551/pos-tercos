import type { Shift } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { shiftCloseTotals } from './shift-close-totals';

/**
 * La fila de un turno es un mini-arqueo: si el total suma un contado
 * incompleto, el dueño ve un faltante que nunca existió.
 */

const base: Shift = {
  id: '00000000-0000-0000-0000-000000000001',
  cashierId: '00000000-0000-0000-0000-000000000002',
  cashierName: 'Victor',
  openedAt: '2026-07-27T18:47:00.000Z',
  closedAt: '2026-07-27T23:56:00.000Z',
  openingCash: 100_000,
  expectedCash: 232_500,
  countedCash: 232_500,
  difference: 0,
  notes: null,
  status: 'CLOSED',
  cashCountBreakdown: null,
  digitalCountBreakdown: null,
  tipsCollected: null,
};

describe('shiftCloseTotals — cuenta', () => {
  it('caja cerrada sin plata digital: la cuenta es 0, no un dato faltante', () => {
    const { account, total } = shiftCloseTotals(base);
    expect(account).toEqual({ expected: 0, counted: 0, difference: 0, partial: false });
    expect(total.expected).toBe(232_500);
    expect(total.counted).toBe(232_500);
    expect(total.difference).toBe(0);
  });

  it('caja abierta: no hay cierre que mostrar', () => {
    const open: Shift = {
      ...base,
      status: 'OPEN',
      closedAt: null,
      expectedCash: null,
      countedCash: null,
      difference: null,
    };
    const { account, total } = shiftCloseTotals(open);
    expect(account.expected).toBeNull();
    expect(total.expected).toBeNull();
  });

  it('suma los medios arqueados y los agrega al total', () => {
    const { account, total } = shiftCloseTotals({
      ...base,
      digitalCountBreakdown: [
        { method: 'TRANSFER', expected: 80_000, counted: 80_000, difference: 0 },
        { method: 'NEQUI', expected: 20_000, counted: 25_000, difference: 5_000 },
      ],
    });
    expect(account).toEqual({
      expected: 100_000,
      counted: 105_000,
      difference: 5_000,
      partial: false,
    });
    expect(total.expected).toBe(332_500);
    expect(total.counted).toBe(337_500);
    expect(total.difference).toBe(5_000);
  });

  it('un medio sin arquear deja la cuenta parcial y el total sin calcular', () => {
    const { account, total } = shiftCloseTotals({
      ...base,
      digitalCountBreakdown: [
        { method: 'TRANSFER', expected: 80_000, counted: 80_000, difference: 0 },
        { method: 'NEQUI', expected: 20_000, counted: null, difference: null },
      ],
    });
    expect(account.counted).toBe(80_000);
    expect(account.partial).toBe(true);
    expect(total.expected).toBe(332_500);
    expect(total.counted).toBeNull();
    expect(total.difference).toBeNull();
  });

  it('ningún medio arqueado: hay esperado pero no contado', () => {
    const { account, total } = shiftCloseTotals({
      ...base,
      digitalCountBreakdown: [
        { method: 'TRANSFER', expected: 80_000, counted: null, difference: null },
      ],
    });
    expect(account.expected).toBe(80_000);
    expect(account.counted).toBeNull();
    expect(account.partial).toBe(true);
    expect(total.expected).toBe(312_500);
    expect(total.counted).toBeNull();
  });
});
