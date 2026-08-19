import { describe, expect, it } from 'vitest';
import { buildClosePayload } from './close-payload';

/**
 * El payload de cierre define lo que queda GRABADO del arqueo. Un campo que
 * viaja como `0` en vez de `undefined` (o al revés) cambia el reporte de la
 * sesión: propinas fantasma, arqueo digital vacío, desglose sin conteo.
 */

const base = {
  countedCash: 250_000,
  arqueo: false,
  counts: {},
  digitalCounts: {},
  tips: null,
  notes: '',
};

describe('buildClosePayload — efectivo contado', () => {
  it('siempre viaja, incluso en 0 (caja vacía es un dato, no un faltante)', () => {
    expect(buildClosePayload({ ...base, countedCash: 0 }).countedCash).toBe(0);
  });
});

describe('buildClosePayload — arqueo por denominación', () => {
  it('sin arqueo no manda desglose', () => {
    expect(buildClosePayload({ ...base, counts: { 50_000: 2 } }).breakdown).toBeUndefined();
  });

  it('con arqueo manda solo las denominaciones con conteo > 0', () => {
    const r = buildClosePayload({
      ...base,
      arqueo: true,
      counts: { 50_000: 2, 20_000: 0, 10_000: 3 },
    });
    expect(r.breakdown).toEqual([
      { denomination: 50_000, count: 2 },
      { denomination: 10_000, count: 3 },
    ]);
  });

  it('arqueo activo pero sin contar nada manda lista vacía (no undefined)', () => {
    expect(buildClosePayload({ ...base, arqueo: true }).breakdown).toEqual([]);
  });
});

describe('buildClosePayload — arqueo digital', () => {
  it('los métodos sin contar (null) se omiten', () => {
    const r = buildClosePayload({
      ...base,
      digitalCounts: { TRANSFER: 80_000, NEQUI: null, CARD: 0 },
    });
    expect(r.digitalCounts).toEqual([
      { method: 'TRANSFER', counted: 80_000 },
      { method: 'CARD', counted: 0 },
    ]);
  });

  it('contar 0 en un método NO es lo mismo que no contarlo', () => {
    const contado = buildClosePayload({ ...base, digitalCounts: { NEQUI: 0 } });
    const sinContar = buildClosePayload({ ...base, digitalCounts: { NEQUI: null } });
    expect(contado.digitalCounts).toEqual([{ method: 'NEQUI', counted: 0 }]);
    expect(sinContar.digitalCounts).toBeUndefined();
  });

  it('si no se arqueó ningún método digital, el campo no viaja', () => {
    expect(buildClosePayload(base).digitalCounts).toBeUndefined();
  });
});

describe('buildClosePayload — propinas y notas', () => {
  it('propina en 0 SÍ viaja (declarar "no hubo" ≠ no declarar)', () => {
    expect(buildClosePayload({ ...base, tips: 0 }).tips).toBe(0);
  });

  it('propina sin declarar queda undefined', () => {
    expect(buildClosePayload({ ...base, tips: null }).tips).toBeUndefined();
  });

  it('las notas se recortan y las vacías no viajan', () => {
    expect(buildClosePayload({ ...base, notes: '  faltó cambio  ' }).notes).toBe('faltó cambio');
    expect(buildClosePayload({ ...base, notes: '   ' }).notes).toBeUndefined();
  });
});
