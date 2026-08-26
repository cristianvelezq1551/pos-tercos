import { describe, expect, it } from 'vitest';
import { computeSuggestedPurchase } from './suggest-quantity';

describe('computeSuggestedPurchase', () => {
  it('el caso que pidió el dueño: 5 panes con mínimo 10 → faltan 5', () => {
    const r = computeSuggestedPurchase({
      currentStock: 5,
      thresholdMin: 10,
      conversionFactor: 1,
    });
    expect(r.deficitStock).toBe(5);
    expect(r.suggestedQty).toBe(5);
    expect(r.resultingStock).toBe(10);
    expect(r.surplusStock).toBe(0);
  });

  it('redondea a la unidad de compra entera: 21/30 unidades, paquete de 12', () => {
    const r = computeSuggestedPurchase({
      currentStock: 21,
      thresholdMin: 30,
      conversionFactor: 12,
    });
    // Faltan 9 unidades = 0,75 paquete → 1 paquete (antes proponía 4).
    expect(r.deficitStock).toBe(9);
    expect(r.suggestedQty).toBe(1);
    expect(r.coverageStock).toBe(12);
    expect(r.resultingStock).toBe(33);
    expect(r.surplusStock).toBe(3);
  });

  it('gramos a kilos: 2.500 g de 3.000 g → 1 kg', () => {
    const r = computeSuggestedPurchase({
      currentStock: 2500,
      thresholdMin: 3000,
      conversionFactor: 1000,
    });
    expect(r.deficitStock).toBe(500);
    expect(r.suggestedQty).toBe(1);
    expect(r.resultingStock).toBe(3500);
  });

  it('la compra SIEMPRE alcanza el mínimo (nunca se queda corta)', () => {
    for (const current of [0, 1, 7, 99, 1234]) {
      for (const threshold of [1, 10, 100, 3000]) {
        for (const factor of [1, 12, 500, 1000]) {
          const r = computeSuggestedPurchase({
            currentStock: current,
            thresholdMin: threshold,
            conversionFactor: factor,
          });
          expect(r.resultingStock).toBeGreaterThanOrEqual(threshold);
          expect(Number.isInteger(r.suggestedQty)).toBe(true);
          expect(r.suggestedQty).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('stock negativo (deuda): hay que reponer el hueco Y llegar al mínimo', () => {
    const r = computeSuggestedPurchase({
      currentStock: -12,
      thresholdMin: 20,
      conversionFactor: 1,
    });
    expect(r.deficitStock).toBe(32);
    expect(r.suggestedQty).toBe(32);
    expect(r.resultingStock).toBe(20);
  });

  it('un factor de conversión inválido no rompe el cálculo', () => {
    for (const factor of [null, 0, -5]) {
      const r = computeSuggestedPurchase({
        currentStock: 2,
        thresholdMin: 10,
        conversionFactor: factor,
      });
      expect(r.suggestedQty).toBe(8);
    }
  });

  it('ya en el mínimo: sin faltante, la compra mínima es 1', () => {
    const r = computeSuggestedPurchase({
      currentStock: 30,
      thresholdMin: 30,
      conversionFactor: 12,
    });
    expect(r.deficitStock).toBe(0);
    expect(r.suggestedQty).toBe(1);
  });
});
