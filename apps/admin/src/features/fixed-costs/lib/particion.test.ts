import type { FixedCost } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { partirCostos } from './particion';

function costo(over: Partial<FixedCost>): FixedCost {
  return {
    id: over.name ?? 'x',
    name: 'X',
    amount: 100_000,
    frequency: 'MONTHLY',
    category: 'Otros',
    startedAt: null,
    endedAt: null,
    isActive: true,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as FixedCost;
}

describe('partirCostos', () => {
  it('manda mensuales y anuales a recurrentes, y los puntuales a únicos', () => {
    const r = partirCostos([
      costo({ name: 'Arriendo', frequency: 'MONTHLY' }),
      costo({ name: 'Cámara', frequency: 'ANNUAL' }),
      costo({ name: 'Aceite', frequency: 'ONE_TIME', startedAt: '2026-09-08' }),
    ]);
    expect(r.recurrentes.map((c) => c.name)).toEqual(['Arriendo', 'Cámara']);
    expect(r.unicos.map((c) => c.name)).toEqual(['Aceite']);
  });

  it('el total mensual NO cuenta los gastos únicos', () => {
    const r = partirCostos([
      costo({ amount: 2_800_000, frequency: 'MONTHLY' }),
      costo({ amount: 500_000, frequency: 'ONE_TIME', startedAt: '2026-03-02' }),
    ]);
    expect(r.totalRecurrenteMensual).toBe(2_800_000);
    expect(r.totalUnicos).toBe(500_000);
  });

  it('un anual pesa su doceava parte en el total mensual', () => {
    const r = partirCostos([costo({ amount: 480_000, frequency: 'ANNUAL' })]);
    expect(r.totalRecurrenteMensual).toBe(40_000);
  });

  it('lo inactivo se sigue listando pero no suma a ningún total', () => {
    const r = partirCostos([
      costo({ name: 'Viejo', frequency: 'MONTHLY', amount: 900_000, isActive: false }),
      costo({ name: 'Gasto viejo', frequency: 'ONE_TIME', amount: 70_000, isActive: false }),
    ]);
    expect(r.recurrentes).toHaveLength(1);
    expect(r.unicos).toHaveLength(1);
    expect(r.totalRecurrenteMensual).toBe(0);
    expect(r.totalUnicos).toBe(0);
    expect(r.recurrentesActivos).toBe(0);
    expect(r.unicosActivos).toBe(0);
  });

  it('sin costos cargados no rompe', () => {
    expect(partirCostos([])).toMatchObject({
      recurrentes: [],
      unicos: [],
      totalRecurrenteMensual: 0,
      totalUnicos: 0,
    });
  });
});
