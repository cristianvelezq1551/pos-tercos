import type { FixedCost } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { esDelMes, partirCostos } from './particion';

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

const SEPTIEMBRE = { year: 2026, month: 9 };
const NOVIEMBRE = { year: 2026, month: 11 };

describe('partirCostos', () => {
  it('manda mensuales y anuales a recurrentes, y los puntuales a únicos', () => {
    const r = partirCostos(
      [
        costo({ name: 'Arriendo', frequency: 'MONTHLY' }),
        costo({ name: 'Cámara', frequency: 'ANNUAL' }),
        costo({ name: 'Aceite', frequency: 'ONE_TIME', startedAt: '2026-09-08' }),
      ],
      SEPTIEMBRE,
    );
    expect(r.recurrentes.map((c) => c.name)).toEqual(['Arriendo', 'Cámara']);
    expect(r.unicos.map((c) => c.name)).toEqual(['Aceite']);
  });

  it('el total mensual NO cuenta los gastos únicos', () => {
    const r = partirCostos(
      [
        costo({ amount: 2_800_000, frequency: 'MONTHLY' }),
        costo({ amount: 500_000, frequency: 'ONE_TIME', startedAt: '2026-03-02' }),
      ],
      { year: 2026, month: 3 },
    );
    expect(r.totalRecurrenteMensual).toBe(2_800_000);
    expect(r.totalUnicos).toBe(500_000);
  });

  it('un anual pesa su doceava parte en el total mensual', () => {
    const r = partirCostos([costo({ amount: 480_000, frequency: 'ANNUAL' })], NOVIEMBRE);
    expect(r.totalRecurrenteMensual).toBe(40_000);
  });

  it('solo lista y suma los gastos únicos del mes elegido', () => {
    const costos = [
      costo({ name: 'Aceite sep', frequency: 'ONE_TIME', amount: 90_000, startedAt: '2026-09-30' }),
      costo({ name: 'Aseo nov', frequency: 'ONE_TIME', amount: 40_000, startedAt: '2026-11-01' }),
      costo({ name: 'Aceite nov', frequency: 'ONE_TIME', amount: 85_000, startedAt: '2026-11-20' }),
      costo({ name: 'Arriendo', frequency: 'MONTHLY', amount: 2_000_000 }),
    ];
    const nov = partirCostos(costos, NOVIEMBRE);
    expect(nov.unicos.map((c) => c.name)).toEqual(['Aseo nov', 'Aceite nov']);
    expect(nov.totalUnicos).toBe(125_000);
    // Los recurrentes no dependen del mes elegido.
    expect(nov.recurrentes.map((c) => c.name)).toEqual(['Arriendo']);

    const sep = partirCostos(costos, SEPTIEMBRE);
    expect(sep.unicos.map((c) => c.name)).toEqual(['Aceite sep']);
    expect(sep.totalUnicos).toBe(90_000);
  });

  it('el mismo mes de otro año no se mezcla', () => {
    const r = partirCostos(
      [costo({ frequency: 'ONE_TIME', startedAt: '2025-11-15' })],
      NOVIEMBRE,
    );
    expect(r.unicos).toHaveLength(0);
  });

  it('ordena los del mes por fecha', () => {
    const r = partirCostos(
      [
        costo({ name: 'B', frequency: 'ONE_TIME', startedAt: '2026-11-20' }),
        costo({ name: 'A', frequency: 'ONE_TIME', startedAt: '2026-11-03' }),
      ],
      NOVIEMBRE,
    );
    expect(r.unicos.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('un gasto único sin fecha no cae en ningún mes, pero no se pierde de vista', () => {
    const r = partirCostos(
      [costo({ name: 'Huérfano', frequency: 'ONE_TIME', startedAt: null })],
      NOVIEMBRE,
    );
    expect(r.unicos).toHaveLength(0);
    expect(r.unicosSinFecha.map((c) => c.name)).toEqual(['Huérfano']);
    expect(r.totalUnicos).toBe(0);
  });

  it('lo inactivo se sigue listando pero no suma a ningún total', () => {
    const r = partirCostos(
      [
        costo({ name: 'Viejo', frequency: 'MONTHLY', amount: 900_000, isActive: false }),
        costo({
          name: 'Gasto viejo',
          frequency: 'ONE_TIME',
          amount: 70_000,
          startedAt: '2026-11-05',
          isActive: false,
        }),
      ],
      NOVIEMBRE,
    );
    expect(r.recurrentes).toHaveLength(1);
    expect(r.unicos).toHaveLength(1);
    expect(r.totalRecurrenteMensual).toBe(0);
    expect(r.totalUnicos).toBe(0);
    expect(r.recurrentesActivos).toBe(0);
    expect(r.unicosActivos).toBe(0);
  });

  it('sin costos cargados no rompe', () => {
    expect(partirCostos([], NOVIEMBRE)).toMatchObject({
      recurrentes: [],
      unicos: [],
      unicosSinFecha: [],
      totalRecurrenteMensual: 0,
      totalUnicos: 0,
    });
  });
});

describe('esDelMes', () => {
  it('compara año y mes del calendario, sin pasar por Date', () => {
    expect(esDelMes('2026-11-30', NOVIEMBRE)).toBe(true);
    expect(esDelMes('2026-12-01', NOVIEMBRE)).toBe(false);
    expect(esDelMes('2026-10-31', NOVIEMBRE)).toBe(false);
  });
});
