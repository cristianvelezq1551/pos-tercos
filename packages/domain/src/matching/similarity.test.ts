import { describe, expect, it } from 'vitest';
import { bestMatch, similarity } from './similarity';

/**
 * §4.4: el fuzzy match sugiere el Stockable correcto para la descripción cruda
 * que la IA saca de una factura. Un cambio en el boost 0.85 / el umbral
 * des-matchearía facturas EN SILENCIO. Estos tests fijan el comportamiento.
 */
describe('similarity', () => {
  it('exacto = 1 (case + diacríticos ignorados)', () => {
    expect(similarity('Pollo crudo', 'Pollo crudo')).toBe(1);
    expect(similarity('PÓLLO', 'pollo')).toBe(1);
  });

  it('substring (≥3 chars) → boost 0.85', () => {
    expect(similarity('pollo', 'pollo entero limpio')).toBe(0.85);
    expect(similarity('coca cola 600', 'coca cola')).toBe(0.85);
  });

  it('substring MUY corto (<3 chars) NO da boost (evita match falso)', () => {
    // "sa" es substring de "salsa" pero solo 2 chars → sin boost 0.85.
    expect(similarity('sa', 'salsa')).toBeLessThan(0.85);
  });

  it('token overlap normalizado, capado a 0.84', () => {
    // 2 de 3 tokens coinciden → 0.667.
    expect(similarity('pollo crudo', 'crudo pollo entero')).toBeCloseTo(0.667, 2);
  });

  it('sin nada en común → 0', () => {
    expect(similarity('gaseosa', 'aceite vegetal')).toBe(0);
    expect(similarity('', 'pollo')).toBe(0);
  });
});

describe('bestMatch', () => {
  const cands = [{ name: 'Pollo crudo' }, { name: 'Gaseosa 600ml' }, { name: 'Aceite' }];
  it('devuelve el candidato de mayor score sobre el umbral', () => {
    const r = bestMatch('POLLO ENTERO', cands, (c) => c.name);
    expect(r?.candidate.name).toBe('Pollo crudo');
    expect(r!.score).toBeGreaterThanOrEqual(0.4);
  });
  it('null si nada supera el umbral', () => {
    expect(bestMatch('tornillos', cands, (c) => c.name)).toBeNull();
  });
});
