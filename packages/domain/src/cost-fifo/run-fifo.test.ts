import { describe, it, expect } from 'vitest';
import { runFifo } from './run-fifo';
import type { FifoMovement } from './types';

const mov = (p: Partial<FifoMovement> & { id: string; delta: number }): FifoMovement => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  type: p.delta > 0 ? 'PURCHASE' : 'SALE',
  unitCost: null,
  sourceId: null,
  ...p,
});

describe('runFifo', () => {
  it('costea un consumo contra un único lote', () => {
    const r = runFifo([
      mov({ id: 'p1', delta: 10, unitCost: 8000, createdAt: '2026-01-01T00:00:00Z' }),
      mov({ id: 's1', delta: -2, type: 'SALE', sourceId: 'sale1', createdAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(r.consumptions).toHaveLength(1);
    expect(r.consumptions[0]!.cost).toBe(16000); // 2 × 8000
    expect(r.consumptions[0]!.unknownQty).toBe(0);
    expect(r.remainingValue).toBe(64000); // 8 × 8000
  });

  it('consume FIFO a través de varios lotes (viejo primero)', () => {
    const r = runFifo([
      mov({ id: 'p1', delta: 10, unitCost: 8000, createdAt: '2026-01-01T00:00:00Z' }),
      mov({ id: 'p2', delta: 10, unitCost: 12000, createdAt: '2026-01-02T00:00:00Z' }),
      // consume 15: 10@8000 + 5@12000 = 80000 + 60000 = 140000
      mov({ id: 's1', delta: -15, type: 'SALE', sourceId: 'sale1', createdAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(r.consumptions[0]!.cost).toBe(140000);
    // queda 5 @ 12000 = 60000
    expect(r.remainingValue).toBe(60000);
    expect(r.remainingLots).toHaveLength(1);
    expect(r.remainingLots[0]!.qty).toBe(5);
  });

  it('marca unknownQty cuando el lote no tiene costo', () => {
    const r = runFifo([
      mov({ id: 'p1', delta: 5, unitCost: null, type: 'INITIAL', createdAt: '2026-01-01T00:00:00Z' }),
      mov({ id: 's1', delta: -3, type: 'SALE', sourceId: 'sale1', createdAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(r.consumptions[0]!.cost).toBe(0);
    expect(r.consumptions[0]!.unknownQty).toBe(3);
    expect(r.remainingUnknownQty).toBe(2);
  });

  it('marca unknownQty cuando se consume más que el stock conocido', () => {
    const r = runFifo([
      mov({ id: 'p1', delta: 2, unitCost: 1000, createdAt: '2026-01-01T00:00:00Z' }),
      mov({ id: 's1', delta: -5, type: 'SALE', sourceId: 'sale1', createdAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(r.consumptions[0]!.cost).toBe(2000); // solo 2 con costo
    expect(r.consumptions[0]!.unknownQty).toBe(3); // 3 sin stock conocido
    expect(r.remainingLots).toHaveLength(0);
  });

  it('costea la merma (WASTE) igual que un consumo', () => {
    const r = runFifo([
      mov({ id: 'p1', delta: 10, unitCost: 500, createdAt: '2026-01-01T00:00:00Z' }),
      mov({ id: 'w1', delta: -4, type: 'WASTE', createdAt: '2026-01-02T00:00:00Z' }),
    ]);
    const waste = r.consumptions.find((c) => c.type === 'WASTE')!;
    expect(waste.cost).toBe(2000); // 4 × 500
    expect(r.remainingValue).toBe(3000); // 6 × 500
  });

  it('reversión de anulación devuelve el costo exacto → COGS neto 0', () => {
    const r = runFifo([
      mov({ id: 'p1', delta: 10, unitCost: 8000, createdAt: '2026-01-01T00:00:00Z' }),
      mov({ id: 'p2', delta: 10, unitCost: 12000, createdAt: '2026-01-02T00:00:00Z' }),
      // venta consume 15 (10@8000 + 5@12000 = 140000)
      mov({ id: 's1', delta: -15, type: 'SALE', sourceId: 'saleX', createdAt: '2026-01-03T00:00:00Z' }),
      // anulación de saleX devuelve los 15
      mov({ id: 's1r', delta: 15, type: 'SALE', sourceId: 'saleX', createdAt: '2026-01-04T00:00:00Z' }),
    ]);
    const net = r.consumptions
      .filter((c) => c.sourceId === 'saleX')
      .reduce((s, c) => s + c.cost, 0);
    expect(net).toBe(0); // 140000 + (−140000)
    // El stock vuelve a 20 con su valor original (80000 + 120000).
    expect(r.remainingValue).toBe(200000);
  });

  it('respeta el orden: entradas antes que consumos en el mismo instante', () => {
    const t = '2026-01-01T00:00:00Z';
    const r = runFifo([
      mov({ id: 's1', delta: -2, type: 'SALE', sourceId: 'sale1', createdAt: t }),
      mov({ id: 'p1', delta: 10, unitCost: 1000, createdAt: t }),
    ]);
    // La compra se aplica primero → el consumo encuentra stock.
    expect(r.consumptions[0]!.cost).toBe(2000);
    expect(r.consumptions[0]!.unknownQty).toBe(0);
  });

  it('combina lotes con y sin costo en un mismo consumo', () => {
    const r = runFifo([
      mov({ id: 'p1', delta: 3, unitCost: null, type: 'INITIAL', createdAt: '2026-01-01T00:00:00Z' }),
      mov({ id: 'p2', delta: 5, unitCost: 2000, createdAt: '2026-01-02T00:00:00Z' }),
      // consume 6: 3 sin costo + 3@2000
      mov({ id: 's1', delta: -6, type: 'SALE', sourceId: 'sale1', createdAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(r.consumptions[0]!.cost).toBe(6000); // 3 × 2000
    expect(r.consumptions[0]!.unknownQty).toBe(3);
    expect(r.remainingValue).toBe(4000); // 2 × 2000
  });
});
