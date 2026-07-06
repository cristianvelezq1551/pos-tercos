import { describe, expect, it } from 'vitest';
import { roundCost, roundMoney, roundsToZeroAt4 } from './money';

/**
 * Casos ADVERSARIALES de redondeo (informe de calidad A6): los inputs de las
 * demás suites son COP enteros, así que un flip del MODO de redondeo a nivel
 * centavo (round→floor/ceil) sobrevivía a todos los tests. Estos lo matan.
 */
describe('roundMoney — modo de redondeo a nivel centavo', () => {
  it('redondea hacia ARRIBA el medio centavo alto (floor fallaría)', () => {
    expect(roundMoney(1.006)).toBe(1.01);
    expect(roundMoney(34.965000000000003)).toBe(34.97);
  });

  it('redondea hacia ABAJO el medio centavo bajo (ceil fallaría)', () => {
    expect(roundMoney(1.004)).toBe(1.0);
    expect(roundMoney(99.991)).toBe(99.99);
  });

  it('negativos: simétrico con Math.round (deudas/reversos)', () => {
    expect(roundMoney(-1.006)).toBe(-1.01);
    expect(roundMoney(-1.004)).toBe(-1.0);
  });
});

describe('roundCost — 4 decimales del ledger', () => {
  it('cuarto decimal correcto en ambos sentidos', () => {
    expect(roundCost(0.00016)).toBe(0.0002);
    expect(roundCost(0.00014)).toBe(0.0001);
  });

  it('roundsToZeroAt4 coincide con la escala del CHECK delta<>0', () => {
    expect(roundsToZeroAt4(0.00004)).toBe(true);
    expect(roundsToZeroAt4(0.00006)).toBe(false);
  });
});
