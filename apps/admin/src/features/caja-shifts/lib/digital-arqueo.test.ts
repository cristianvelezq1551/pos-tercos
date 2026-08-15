import { describe, expect, it } from 'vitest';
import { digitalDifference, digitalTargets, missingDigitalCounts } from './digital-arqueo';
import type { ShiftSummary } from './shift-summary';

/**
 * El cierre EXIGE contar cada medio de cuenta. Si la lista de medios se queda
 * corta, la caja cierra con plata digital sin verificar — justo el agujero que
 * dejaba un descuadre de efectivo "limpio" al lado de $25.000 sin arquear.
 */

const summary = {
  byMethod: {
    CASH: { count: 3, total: 100_000 },
    TRANSFER: { count: 1, total: 25_000 },
  },
} as unknown as ShiftSummary;

describe('digitalTargets', () => {
  it('manda la lista del server, no el cálculo local', () => {
    expect(
      digitalTargets([{ method: 'NEQUI', name: 'Nequi', expected: 40_000 }], summary, {}),
    ).toEqual([{ method: 'NEQUI', name: 'Nequi', expected: 40_000 }]);
  });

  it('sin lista del server cae a las ventas cargadas + movimientos', () => {
    expect(digitalTargets(null, summary, { CARD: -5_000 })).toEqual([
      { method: 'TRANSFER', name: 'Transferencia', expected: 25_000 },
      { method: 'CARD', name: 'Tarjeta', expected: -5_000 },
    ]);
  });

  it('nunca pide arquear el efectivo', () => {
    expect(digitalTargets(null, summary, {}).some((t) => t.method === 'CASH')).toBe(false);
  });
});

describe('missingDigitalCounts', () => {
  const targets = [
    { method: 'TRANSFER', name: 'Transferencia', expected: 25_000 },
    { method: 'NEQUI', name: 'Nequi', expected: 10_000 },
  ];

  it('un medio sin tocar bloquea el cierre', () => {
    expect(missingDigitalCounts(targets, { TRANSFER: 25_000 }).map((m) => m.method)).toEqual([
      'NEQUI',
    ]);
  });

  it('contar 0 SÍ es arquear', () => {
    expect(missingDigitalCounts(targets, { TRANSFER: 25_000, NEQUI: 0 })).toEqual([]);
  });
});

describe('digitalDifference', () => {
  it('suma el descuadre de los medios arqueados', () => {
    expect(
      digitalDifference(
        [
          { method: 'TRANSFER', name: 'Transferencia', expected: 25_000 },
          { method: 'NEQUI', name: 'Nequi', expected: 10_000 },
        ],
        { TRANSFER: 25_000, NEQUI: 12_000 },
      ),
    ).toBe(2_000);
  });

  it('ignora lo que todavía no se contó', () => {
    expect(
      digitalDifference([{ method: 'TRANSFER', name: 'Transferencia', expected: 25_000 }], {}),
    ).toBe(0);
  });
});
