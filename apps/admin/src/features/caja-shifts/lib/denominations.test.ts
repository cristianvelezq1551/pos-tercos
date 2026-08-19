import type { CashMovement } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import {
  cashMovementsNet,
  digitalMovementsNet,
  sumBreakdown,
  toBreakdownLines,
} from './denominations';

const mov = (over: Partial<CashMovement> = {}): CashMovement => ({
  id: crypto.randomUUID(),
  shiftId: '00000000-0000-4000-8000-000000000010',
  type: 'IN',
  method: 'CASH',
  amount: 10_000,
  reason: 'test',
  userId: '00000000-0000-4000-8000-000000000011',
  createdAt: new Date('2026-06-10T12:00:00Z').toISOString(),
  ...over,
});

describe('sumBreakdown / toBreakdownLines', () => {
  it('suma denominación × cantidad', () => {
    expect(sumBreakdown({ 50_000: 2, 10_000: 3, 200: 5 })).toBe(131_000);
  });

  it('toBreakdownLines omite denominaciones en cero', () => {
    const lines = toBreakdownLines({ 50_000: 1, 10_000: 0 });
    expect(lines).toEqual([{ denomination: 50_000, count: 1 }]);
  });
});

describe('cashMovementsNet', () => {
  it('entradas suman, salidas restan — SOLO efectivo', () => {
    const net = cashMovementsNet([
      mov({ amount: 20_000 }),
      mov({ type: 'OUT', amount: 5_000 }),
      // Movimiento digital: NO toca el cajón físico.
      mov({ type: 'OUT', amount: 50_000, method: 'TRANSFER' }),
    ]);
    expect(net).toEqual({ cashIn: 20_000, cashOut: 5_000, net: 15_000 });
  });

  it('sin movimientos devuelve ceros', () => {
    expect(cashMovementsNet([])).toEqual({ cashIn: 0, cashOut: 0, net: 0 });
  });
});

describe('digitalMovementsNet', () => {
  it('neto IN−OUT por método digital; ignora efectivo', () => {
    const net = digitalMovementsNet([
      mov({ method: 'TRANSFER', amount: 30_000 }),
      mov({ method: 'TRANSFER', type: 'OUT', amount: 12_000 }),
      mov({ method: 'NEQUI', type: 'OUT', amount: 4_000 }),
      mov({ amount: 99_000 }), // CASH — fuera
    ]);
    expect(net).toEqual({ TRANSFER: 18_000, NEQUI: -4_000 });
  });
});
