import { describe, expect, it } from 'vitest';
import { manualDiscountAmount, type ManualDiscountSpec } from '../common/manual-discount';
import { applyPromotion } from './apply-promotions';
import type { PromotionDef } from './types';

/**
 * **El precio no puede depender de cómo se tecleó el pedido.**
 *
 * Tres hamburguesas son tres hamburguesas, vayan en una línea de cantidad 3 o
 * en tres líneas de a uno — que es lo que pasa en cuanto cada una lleva su
 * indicación ("sin cebolla"), sin que nadie toque ningún botón.
 *
 * Antes esto se rompía en los descuentos de MONTO FIJO, que se aplicaban una
 * vez por LÍNEA ignorando la cantidad: la misma compra costaba −$2.000 junta y
 * −$6.000 separada. Medido en producción el 2026-08-31.
 */
const AL_MEDIODIA = new Date(2026, 8, 1, 12, 0, 0);
const PRECIO = 10_000;

const base = {
  daysOfWeekMask: 127,
  // Una promo "todo el día" se guarda así: `withinTimeWindow` compara cadenas y
  // con null === null devuelve false, o sea que nunca aplicaría.
  timeStart: '00:00:00',
  timeEnd: '23:59:59',
  activeFrom: null,
  activeTo: null,
  productIds: new Set(['burger']),
};

const descuentoTotal = (promo: PromotionDef, lineas: number[], combo = false): number =>
  lineas.reduce(
    (acc, cantidad) =>
      acc +
      applyPromotion(
        {
          productId: 'burger',
          lineSubtotal: PRECIO * cantidad,
          quantity: cantidad,
          isCombo: combo,
          at: AL_MEDIODIA,
        },
        [promo],
      ).lineDiscount,
    0,
  );

describe('el descuento no cambia según cómo se repartan las líneas', () => {
  const repartos: Array<[string, number[]]> = [
    ['una línea de 3', [3]],
    ['tres líneas de 1', [1, 1, 1]],
    ['una de 2 y una de 1', [2, 1]],
  ];

  it('PORCENTAJE: mismo total en los tres repartos', () => {
    const promo = { id: 'p', type: 'PERCENT_OFF', discountPct: 0.2, ...base } as PromotionDef;
    const totales = repartos.map(([, r]) => descuentoTotal(promo, r));
    expect(new Set(totales).size).toBe(1);
    expect(totales[0]).toBe(PRECIO * 3 * 0.2);
  });

  it('MONTO FIJO: mismo total en los tres repartos (era el bug)', () => {
    const promo = { id: 'p', type: 'FIXED_OFF', discountFixed: 2_000, ...base } as PromotionDef;
    const totales = repartos.map(([, r]) => descuentoTotal(promo, r));
    expect(new Set(totales).size).toBe(1);
    // $2.000 por cada hamburguesa: tres hamburguesas, $6.000.
    expect(totales[0]).toBe(6_000);
  });

  it('COMBO con monto fijo: mismo total en los tres repartos', () => {
    const promo = { id: 'p', type: 'COMBO_OFF', discountFixed: 2_000, ...base } as PromotionDef;
    const totales = repartos.map(([, r]) => descuentoTotal(promo, r, true));
    expect(new Set(totales).size).toBe(1);
    expect(totales[0]).toBe(6_000);
  });

  it('el monto fijo NUNCA baja del subtotal de la línea', () => {
    const promo = { id: 'p', type: 'FIXED_OFF', discountFixed: 99_000, ...base } as PromotionDef;
    // Descuento mayor que el precio: se topa, no deja el total en negativo.
    expect(descuentoTotal(promo, [2])).toBe(PRECIO * 2);
  });

  /**
   * ⚠️ LIMITACIÓN CONOCIDA, a propósito y documentada.
   *
   * El 2x1 se calcula por línea (`Math.floor(cantidad / tamaño)`), así que dos
   * unidades en líneas sueltas NO lo disparan. Arreglarlo exige que el motor
   * agrupe por producto ANTES de calcular — en la caja, el servidor y la web —
   * y repartir el descuento entre las líneas. Es el "movimiento 2".
   *
   * Mientras esto siga rojo… perdón, verde: NO crear promociones 2x1 sin
   * avisar. Este caso existe para que el día que se arregle, falle y obligue a
   * borrarlo.
   */
  it('2x1: TODAVÍA depende del reparto (limitación conocida)', () => {
    const promo = {
      id: 'p',
      type: 'BOGO',
      bogoBuyQty: 1,
      bogoGetQty: 1,
      ...base,
    } as PromotionDef;
    expect(descuentoTotal(promo, [2])).toBe(PRECIO);
    expect(descuentoTotal(promo, [1, 1])).toBe(0);
  });
});

/**
 * El descuento manual de la caja tenía el MISMO problema que las promociones, y
 * se arregló después: hasta el 2026-08-31 el monto fijo se aplicaba una vez por
 * línea, así que "$500 sobre tres bebidas" cobraba $14.500 junto y $13.500
 * separado. Medido contra el servidor de producción durante la auditoría.
 */
describe('el descuento manual tampoco cambia según el reparto', () => {
  const manual = (spec: ManualDiscountSpec, lineas: number[]): number =>
    lineas.reduce((acc, cantidad) => acc + manualDiscountAmount(PRECIO * cantidad, spec, cantidad), 0);

  const repartos = [[3], [1, 1, 1], [2, 1]];

  it('MONTO FIJO: mismo total en los tres repartos', () => {
    const totales = repartos.map((r) => manual({ kind: 'FIXED', value: 2_000 }, r));
    expect(new Set(totales).size).toBe(1);
    expect(totales[0]).toBe(6_000);
  });

  it('PORCENTAJE: mismo total en los tres repartos', () => {
    const totales = repartos.map((r) => manual({ kind: 'PERCENT', value: 20 }, r));
    expect(new Set(totales).size).toBe(1);
    expect(totales[0]).toBe(PRECIO * 3 * 0.2);
  });

  it('el descuento manual da lo mismo que la promoción de monto fijo equivalente', () => {
    const promo = { id: 'p', type: 'FIXED_OFF', discountFixed: 2_000, ...base } as PromotionDef;
    expect(manual({ kind: 'FIXED', value: 2_000 }, [3])).toBe(descuentoTotal(promo, [3]));
  });
});
