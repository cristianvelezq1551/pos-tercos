import {
  MAX_PROOFS_POR_PAGO,
  primaryObligatoria,
  appendProofs,
  proofCount,
  proofKeyAt,
  proofKeys,
  removeProofAt,
  toSlots,
} from './proof-images';

describe('proof-images', () => {
  it('la lista completa arranca por la columna vieja', () => {
    expect(proofKeys('a.jpg', ['b.jpg', 'c.jpg'])).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(proofCount('a.jpg', ['b.jpg'])).toBe(2);
  });

  it('sin comprobante primario no hay lista (aunque haya extras huérfanos)', () => {
    expect(proofKeys(null, [])).toEqual([]);
    expect(proofCount(null, [])).toBe(0);
  });

  it('agregar deja la primera intacta: nadie que lea la columna vieja se entera', () => {
    const slots = appendProofs('a.jpg', [], ['b.jpg', 'c.jpg']);
    expect(slots.primary).toBe('a.jpg');
    expect(slots.extras).toEqual(['b.jpg', 'c.jpg']);
  });

  it('un pago sin comprobante toma la primera imagen como primaria', () => {
    expect(appendProofs(null, [], ['x.jpg'])).toEqual({ primary: 'x.jpg', extras: [] });
  });

  it('rechaza pasarse del tope', () => {
    const extras = Array.from({ length: MAX_PROOFS_POR_PAGO - 1 }, (_, i) => `e${i}.jpg`);
    expect(() => appendProofs('a.jpg', extras, ['mas.jpg'])).toThrow(/hasta 8 comprobantes/);
  });

  it('quitar la primaria promueve a la siguiente', () => {
    const { slots, removed } = removeProofAt('a.jpg', ['b.jpg', 'c.jpg'], 0, { minimo: 1 });
    expect(removed).toBe('a.jpg');
    expect(slots).toEqual({ primary: 'b.jpg', extras: ['c.jpg'] });
  });

  it('quitar una del medio no toca la primaria', () => {
    const { slots, removed } = removeProofAt('a.jpg', ['b.jpg', 'c.jpg'], 1, { minimo: 1 });
    expect(removed).toBe('b.jpg');
    expect(slots).toEqual({ primary: 'a.jpg', extras: ['c.jpg'] });
  });

  it('no deja sin comprobante a un pago que lo exige', () => {
    expect(() => removeProofAt('a.jpg', [], 0, { minimo: 1 })).toThrow(/al menos un comprobante/);
  });

  it('sí deja vacío cuando el comprobante es opcional', () => {
    const { slots } = removeProofAt('a.jpg', [], 0, { minimo: 0 });
    expect(slots).toEqual({ primary: null, extras: [] });
  });

  it('un índice inexistente falla con mensaje de persona', () => {
    expect(() => removeProofAt('a.jpg', [], 5, { minimo: 0 })).toThrow(/ya no existe/);
  });

  it('proofKeyAt indexa sobre la lista completa', () => {
    expect(proofKeyAt('a.jpg', ['b.jpg'], 1)).toBe('b.jpg');
    expect(proofKeyAt('a.jpg', ['b.jpg'], 9)).toBeNull();
  });

  it('toSlots es la inversa de proofKeys', () => {
    const keys = ['a.jpg', 'b.jpg', 'c.jpg'];
    const s = toSlots(keys);
    expect(proofKeys(s.primary, s.extras)).toEqual(keys);
  });
});

describe('primaryObligatoria', () => {
  it('devuelve la primera cuando existe', () => {
    expect(primaryObligatoria({ primary: 'a.jpg', extras: [] })).toBe('a.jpg');
  });

  it('rompe en vez de guardar una key vacía en un pago que exige comprobante', () => {
    expect(() => primaryObligatoria({ primary: null, extras: [] })).toThrow(
      /al menos un comprobante/,
    );
  });
});
