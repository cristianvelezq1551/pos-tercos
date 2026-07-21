import { describe, expect, it } from 'vitest';
import { roundCost, roundMoney, roundsToZeroAt4 } from './money';

/**
 * roundMoney redondea a PESO ENTERO (COP no tiene centavos en la operación).
 * Casos ADVERSARIALES a nivel peso: un flip del modo (round→floor/ceil)
 * sobreviviría a las demás suites (inputs enteros); estos lo matan.
 */
describe('roundMoney — peso entero (COP sin centavos)', () => {
  it('redondea hacia ARRIBA el medio peso alto (floor fallaría)', () => {
    expect(roundMoney(1342.5)).toBe(1343); // 15% de $8.950
    expect(roundMoney(7607.6)).toBe(7608);
  });

  it('redondea hacia ABAJO el medio peso bajo (ceil fallaría)', () => {
    expect(roundMoney(7607.4)).toBe(7607);
    expect(roundMoney(99.49)).toBe(99);
  });

  it('un total con centavos queda entero (cuadra el split/arqueo)', () => {
    expect(roundMoney(7607.5)).toBe(7608);
    expect(Number.isInteger(roundMoney(1234.567))).toBe(true);
  });

  it('negativos: simétrico con Math.round (deudas/reversos)', () => {
    expect(roundMoney(-1342.6)).toBe(-1343);
    expect(roundMoney(-1342.4)).toBe(-1342);
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
