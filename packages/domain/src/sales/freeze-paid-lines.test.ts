import { describe, expect, it } from 'vitest';
import { freezePaidLines, paidLineKey, type PaidLineSnapshot } from './freeze-paid-lines';

/**
 * Decisión 2026-08-25: una venta YA COBRADA no se re-precia al editarla. Estas
 * leyes las aplican DOS lados (el server que persiste y el modal del cajero que
 * estima), así que vivir en domain es lo que impide que se separen.
 */

const round = (n: number): number => Math.round(n * 100) / 100;
const paid = (over: Partial<PaidLineSnapshot> = {}): PaidLineSnapshot => ({
  key: 'p1||',
  quantity: 1,
  unitPrice: 10_000,
  lineDiscount: 0,
  ...over,
});

describe('freezePaidLines', () => {
  it('conserva el precio cobrado aunque el catálogo haya subido', () => {
    const [frozen] = freezePaidLines([paid()], [{ key: 'p1||', quantity: 1 }], round);
    expect(frozen).toEqual({ unitPrice: 10_000, lineSubtotal: 10_000, lineDiscount: 0 });
  });

  it('conserva el descuento de la promo con la que se cobró', () => {
    const [frozen] = freezePaidLines(
      [paid({ lineDiscount: 2_000 })],
      [{ key: 'p1||', quantity: 1 }],
      round,
    );
    expect(frozen?.lineDiscount).toBe(2_000);
  });

  it('escala el descuento POR UNIDAD cuando cambia la cantidad', () => {
    const snapshot = paid({ quantity: 4, lineDiscount: 4_000 }); // $1.000 por unidad
    const [menos] = freezePaidLines([snapshot], [{ key: 'p1||', quantity: 2 }], round);
    expect(menos).toEqual({ unitPrice: 10_000, lineSubtotal: 20_000, lineDiscount: 2_000 });
    const [mas] = freezePaidLines([paid({ quantity: 4, lineDiscount: 4_000 })], [
      { key: 'p1||', quantity: 6 },
    ], round);
    expect(mas?.lineDiscount).toBe(6_000);
  });

  it('el descuento nunca supera el subtotal de la línea', () => {
    const [frozen] = freezePaidLines(
      [paid({ quantity: 1, unitPrice: 100, lineDiscount: 100 })],
      [{ key: 'p1||', quantity: 1 }],
      round,
    );
    expect(frozen?.lineDiscount).toBe(100);
    expect(frozen!.lineSubtotal - frozen!.lineDiscount).toBe(0);
  });

  it('una línea NUEVA no se congela (va a precio de hoy)', () => {
    const [frozen] = freezePaidLines([paid()], [{ key: 'otro||', quantity: 1 }], round);
    expect(frozen).toBeNull();
  });

  it('el emparejamiento CONSUME: dos líneas iguales toman dos cobradas distintas', () => {
    const frozen = freezePaidLines(
      [paid({ unitPrice: 10_000 }), paid({ unitPrice: 8_000 })],
      [
        { key: 'p1||', quantity: 1 },
        { key: 'p1||', quantity: 1 },
        { key: 'p1||', quantity: 1 },
      ],
      round,
    );
    expect(frozen.map((f) => f?.unitPrice ?? null)).toEqual([10_000, 8_000, null]);
  });

  it('una venta sin líneas cobradas no congela nada', () => {
    expect(freezePaidLines([], [{ key: 'p1||', quantity: 2 }], round)).toEqual([null]);
  });
});

describe('paidLineKey', () => {
  it('ignora las notas: corregir "sin cebolla" no re-precia la línea', () => {
    expect(paidLineKey('p1', null, [])).toBe(paidLineKey('p1', null, []));
  });

  it('distingue tamaño y modificadores, sin importar el orden de estos', () => {
    expect(paidLineKey('p1', 's1', ['a', 'b'])).toBe(paidLineKey('p1', 's1', ['b', 'a']));
    expect(paidLineKey('p1', 's1', ['a'])).not.toBe(paidLineKey('p1', 's2', ['a']));
    expect(paidLineKey('p1', null, ['a'])).not.toBe(paidLineKey('p1', null, []));
  });
});
