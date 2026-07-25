import { describe, expect, it } from 'vitest';
import type { ProductMarginReport } from '@pos-tercos/types';
import { compararCostos } from './comparar-costos';

/**
 * El caso que motivó estos tests: la hamburguesa aparecía costando $7.100 en el
 * reporte de costos y $8.100 en la lista de productos. Los dos números eran
 * correctos — el primero es lo que costó el pan del lote viejo ($1.500) y el
 * segundo lo que cuesta el pan que se compró después ($2.500) — pero vivían en
 * pantallas distintas y parecían una contradicción.
 */
const hamburguesa: ProductMarginReport['products'][number] = {
  productId: 'p1',
  productName: 'Hamburguesa sencilla',
  unitsSold: 3,
  revenue: 45000,
  cogs: 21300, // 3 × $7.100 (lote viejo)
  margin: 23700,
  marginPct: 0.5266,
  cogsPartial: false,
};

describe('compararCostos', () => {
  it('EL CASO REAL: lleva el costo por unidad al total vendido y marca la diferencia', () => {
    const [fila] = compararCostos([hamburguesa], [
      { productId: 'p1', totalCost: 8100, missingReasons: [] },
    ]);

    expect(fila.realUnitario).toBe(7100);
    expect(fila.refUnitario).toBe(8100);
    expect(fila.refPeriodo).toBe(24300); // 3 × $8.100, comparable contra cogs
    expect(fila.difiere).toBe(true);
  });

  it('cuando los dos costos coinciden no molesta con un aviso', () => {
    const [fila] = compararCostos([hamburguesa], [
      { productId: 'p1', totalCost: 7100, missingReasons: [] },
    ]);
    expect(fila.difiere).toBe(false);
  });

  it('una diferencia de centavos es redondeo, no una señal', () => {
    const [fila] = compararCostos([hamburguesa], [
      { productId: 'p1', totalCost: 7150, missingReasons: [] },
    ]);
    expect(fila.difiere).toBe(false);
  });

  it('sin costo de referencia deja la comparación en blanco en vez de inventarla', () => {
    const [sinDato] = compararCostos([hamburguesa], []);
    expect(sinDato.refUnitario).toBeNull();
    expect(sinDato.refPeriodo).toBeNull();
    expect(sinDato.difiere).toBe(false);

    const [sinCosteo] = compararCostos([hamburguesa], [
      { productId: 'p1', totalCost: null, missingReasons: ['Pan sin costo registrado'] },
    ]);
    expect(sinCosteo.refUnitario).toBeNull();
    expect(sinCosteo.difiere).toBe(false);
  });

  it('sin unidades vendidas no divide por cero', () => {
    const [fila] = compararCostos([{ ...hamburguesa, unitsSold: 0, cogs: 0 }], [
      { productId: 'p1', totalCost: 8100, missingReasons: [] },
    ]);
    expect(fila.realUnitario).toBeNull();
    expect(fila.refPeriodo).toBe(0);
    expect(fila.difiere).toBe(false);
  });

  it('también detecta el caso bueno: el insumo bajó de precio', () => {
    const [fila] = compararCostos([hamburguesa], [
      { productId: 'p1', totalCost: 6000, missingReasons: [] },
    ]);
    expect(fila.difiere).toBe(true);
    expect(fila.refUnitario!).toBeLessThan(fila.realUnitario!);
  });

  it('respeta el orden y la cantidad de productos del reporte', () => {
    const otro = { ...hamburguesa, productId: 'p2', productName: 'Gaseosa' };
    const filas = compararCostos([hamburguesa, otro], [
      { productId: 'p2', totalCost: 8100, missingReasons: [] },
    ]);
    expect(filas.map((f) => f.producto.productId)).toEqual(['p1', 'p2']);
    expect(filas[0].refUnitario).toBeNull();
    expect(filas[1].refUnitario).toBe(8100);
  });
});
