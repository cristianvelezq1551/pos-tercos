import { describe, expect, it } from 'vitest';
import { POCKET_KIND_LABELS, pocketLabelOf, pocketOf } from './treasury';

describe('pocketOf', () => {
  it('solo efectivo → EFECTIVO', () => {
    expect(pocketOf({ cashAmount: 50_000, bankAmount: 0 })).toBe('EFECTIVO');
  });

  it('solo cuenta → CUENTA', () => {
    expect(pocketOf({ cashAmount: 0, bankAmount: 50_000 })).toBe('CUENTA');
  });

  it('las dos partes con plata → MIXTO', () => {
    expect(pocketOf({ cashAmount: 20_000, bankAmount: 30_000 })).toBe('MIXTO');
  });

  it('sin reparto registrado no inventa un bolsillo', () => {
    // Un pago viejo (anterior a la columna) o una API que todavía no lo manda.
    // Decir "Cuenta" porque es el default del formulario sería afirmar de dónde
    // salió la plata sin saberlo.
    expect(pocketOf({ cashAmount: 0, bankAmount: 0 })).toBeNull();
    expect(pocketOf({ cashAmount: null, bankAmount: null })).toBeNull();
    expect(pocketOf({ cashAmount: undefined, bankAmount: undefined })).toBeNull();
  });

  it('un lado ausente y el otro con plata igual resuelve', () => {
    expect(pocketOf({ cashAmount: undefined, bankAmount: 10_000 })).toBe('CUENTA');
    expect(pocketOf({ cashAmount: 10_000, bankAmount: null })).toBe('EFECTIVO');
  });
});

describe('pocketLabelOf', () => {
  it('usa el mismo vocabulario que el selector de pago', () => {
    expect(pocketLabelOf({ cashAmount: 1, bankAmount: 0 })).toBe('Efectivo');
    expect(pocketLabelOf({ cashAmount: 0, bankAmount: 1 })).toBe('Cuenta');
    expect(pocketLabelOf({ cashAmount: 1, bankAmount: 1 })).toBe('Mixto');
  });

  it('sin reparto devuelve null, no una cadena vacía', () => {
    expect(pocketLabelOf({ cashAmount: 0, bankAmount: 0 })).toBeNull();
  });

  it('las tres clases tienen etiqueta', () => {
    expect(Object.keys(POCKET_KIND_LABELS).sort()).toEqual(['CUENTA', 'EFECTIVO', 'MIXTO']);
  });
});
