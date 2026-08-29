/**
 * Tests del motor extendido (FASE 12.A): PERCENT_OFF + FIXED_OFF + BOGO + COMBO_OFF.
 * Migrado a Vitest en FASE 14.E.
 * Ejecutar con `pnpm -F @pos-tercos/domain test`.
 */

import { describe, it, expect } from 'vitest';
import { applyPromotion, getDayOfWeekBit, withinTimeWindow } from './apply-promotions';
import { DAY_BIT, type ApplyPromotionInput, type PromotionDef } from './types';

const NOW = new Date('2026-05-04T15:00:00');

const PROMO_BASE = {
  daysOfWeekMask: 127, // todos los días
  timeStart: '00:00:00',
  timeEnd: '23:59:59',
  activeFrom: null,
  activeTo: null,
} as const;

function input(overrides: Partial<ApplyPromotionInput> = {}): ApplyPromotionInput {
  return {
    productId: 'p1',
    lineSubtotal: 10000,
    quantity: 1,
    isCombo: false,
    at: NOW,
    ...overrides,
  };
}

function eq(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}

describe('applyPromotion', () => {

// PERCENT_OFF
it('PERCENT_OFF 20% sobre $10.000 → $2.000', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'pct1',
      type: 'PERCENT_OFF',
      discountPct: 0.2,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input(), promos);
  eq(r.appliedPromotionId, 'pct1');
  eq(r.lineDiscount, 2000);
});

// FIXED_OFF
it('FIXED_OFF $1.500 sobre línea $10.000 → $1.500', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'fix1',
      type: 'FIXED_OFF',
      discountFixed: 1500,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input(), promos);
  eq(r.lineDiscount, 1500);
});

it('FIXED_OFF $20.000 sobre línea $10.000 → cap a $10.000', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'fix2',
      type: 'FIXED_OFF',
      discountFixed: 20000,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input({ lineSubtotal: 10000 }), promos);
  eq(r.lineDiscount, 10000);
});

// BOGO
it('BOGO 1+1 con quantity=2 (1 set completo) → 1 unidad gratis', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'bogo1',
      type: 'BOGO',
      bogoBuyQty: 1,
      bogoGetQty: 1,
      productIds: new Set(['p1']),
    },
  ];
  // 2 unidades de $5.000 = $10.000 lineSubtotal
  const r = applyPromotion(input({ lineSubtotal: 10000, quantity: 2 }), promos);
  eq(r.lineDiscount, 5000); // 1 unidad gratis = $5k
});

it('BOGO 2+1 con quantity=3 (1 set) → 1 unidad gratis', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'bogo2',
      type: 'BOGO',
      bogoBuyQty: 2,
      bogoGetQty: 1,
      productIds: new Set(['p1']),
    },
  ];
  // 3 unidades de $4.000 = $12.000 lineSubtotal
  const r = applyPromotion(input({ lineSubtotal: 12000, quantity: 3 }), promos);
  eq(r.lineDiscount, 4000); // 1 gratis × $4.000
});

it('BOGO 1+1 con quantity=1 (insuficiente) → 0', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'bogo3',
      type: 'BOGO',
      bogoBuyQty: 1,
      bogoGetQty: 1,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input({ lineSubtotal: 5000, quantity: 1 }), promos);
  eq(r.appliedPromotionId, null);
  eq(r.lineDiscount, 0);
});

it('BOGO 1+1 con quantity=4 (2 sets) → 2 unidades gratis', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'bogo4',
      type: 'BOGO',
      bogoBuyQty: 1,
      bogoGetQty: 1,
      productIds: new Set(['p1']),
    },
  ];
  // 4 × $5.000 = $20.000
  const r = applyPromotion(input({ lineSubtotal: 20000, quantity: 4 }), promos);
  eq(r.lineDiscount, 10000); // 2 unidades gratis
});

// COMBO_OFF
it('COMBO_OFF pct=0.15 NO aplica si producto no es combo', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'cmb1',
      type: 'COMBO_OFF',
      discountPct: 0.15,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input({ isCombo: false }), promos);
  eq(r.appliedPromotionId, null);
});

it('COMBO_OFF pct=0.15 SÍ aplica si producto es combo', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'cmb2',
      type: 'COMBO_OFF',
      discountPct: 0.15,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input({ isCombo: true, lineSubtotal: 20000 }), promos);
  eq(r.lineDiscount, 3000);
});

it('COMBO_OFF fixed=$3.000 sobre combo $20.000', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'cmb3',
      type: 'COMBO_OFF',
      discountFixed: 3000,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input({ isCombo: true, lineSubtotal: 20000 }), promos);
  eq(r.lineDiscount, 3000);
});

// Mejor descuento absoluto gana (mixed types)
it('mejor descuento absoluto gana: PERCENT 10% ($1k) vs FIXED $2k → gana FIXED', () => {
  const promos: PromotionDef[] = [
    {
      ...PROMO_BASE,
      id: 'pct',
      type: 'PERCENT_OFF',
      discountPct: 0.1,
      productIds: new Set(['p1']),
    },
    {
      ...PROMO_BASE,
      id: 'fix',
      type: 'FIXED_OFF',
      discountFixed: 2000,
      productIds: new Set(['p1']),
    },
  ];
  const r = applyPromotion(input({ lineSubtotal: 10000 }), promos);
  eq(r.appliedPromotionId, 'fix');
  eq(r.lineDiscount, 2000);
});

// Rango de fechas activeFrom/activeTo (auditoría §0.6). activeFrom/activeTo son
// `YYYY-MM-DD`; la comparación es contra el día calendario LOCAL de la venta.
// El bug histórico: con Date de medianoche (UTC vs local) la promo moría un día
// antes en Bogotá. Con string ISO es inequívoco corra en la zona que corra.
describe('rango de fechas (activeFrom / activeTo)', () => {
  const dated = (activeFrom: string | null, activeTo: string | null): PromotionDef[] => [
    {
      ...PROMO_BASE,
      id: 'dpct',
      type: 'PERCENT_OFF',
      discountPct: 0.1,
      productIds: new Set(['p1']),
      activeFrom,
      activeTo,
    },
  ];
  // Mediodía local del último día de la ventana — la hora del día NO debe
  // importar (antes, a las 19:00 local ya "caía" al día siguiente en UTC).
  const lastDayNoon = new Date('2026-07-31T12:00:00');
  const lastDayLateNight = new Date('2026-07-31T23:30:00');
  const nextDay = new Date('2026-08-01T00:30:00');
  const firstDay = new Date('2026-07-01T00:30:00');
  const beforeFirst = new Date('2026-06-30T23:30:00');

  it('aplica el ÚLTIMO día de activeTo (mediodía)', () => {
    const r = applyPromotion(input({ at: lastDayNoon }), dated(null, '2026-07-31'));
    eq(r.lineDiscount, 1000);
  });
  it('aplica el último día de activeTo aun de noche (23:30 local)', () => {
    const r = applyPromotion(input({ at: lastDayLateNight }), dated(null, '2026-07-31'));
    eq(r.lineDiscount, 1000);
  });
  it('NO aplica el día siguiente a activeTo', () => {
    const r = applyPromotion(input({ at: nextDay }), dated(null, '2026-07-31'));
    eq(r.lineDiscount, 0);
    eq(r.appliedPromotionId, null);
  });
  it('aplica el PRIMER día de activeFrom', () => {
    const r = applyPromotion(input({ at: firstDay }), dated('2026-07-01', null));
    eq(r.lineDiscount, 1000);
  });
  it('NO aplica el día anterior a activeFrom', () => {
    const r = applyPromotion(input({ at: beforeFirst }), dated('2026-07-01', null));
    eq(r.lineDiscount, 0);
  });
  it('rango cerrado [from, to]: dentro aplica, fuera no', () => {
    const promos = dated('2026-07-01', '2026-07-31');
    eq(applyPromotion(input({ at: lastDayNoon }), promos).lineDiscount, 1000);
    eq(applyPromotion(input({ at: nextDay }), promos).lineDiscount, 0);
    eq(applyPromotion(input({ at: beforeFirst }), promos).lineDiscount, 0);
  });
});

}); // describe('applyPromotion')

// §4.9: ventana horaria (incluye cruce de medianoche) y máscara de días — antes
// sin tests directos. `at` usa hora/día LOCAL del runtime.
describe('withinTimeWindow', () => {
  const at = (h: number, m = 0) => new Date(2026, 4, 4, h, m, 0); // lunes 4-may
  it('ventana normal [start, end): dentro true, bordes correctos', () => {
    expect(withinTimeWindow('18:00:00', '20:00:00', at(19))).toBe(true);
    expect(withinTimeWindow('18:00:00', '20:00:00', at(18))).toBe(true); // inclusivo abajo
    expect(withinTimeWindow('18:00:00', '20:00:00', at(20))).toBe(false); // exclusivo arriba
    expect(withinTimeWindow('18:00:00', '20:00:00', at(12))).toBe(false);
  });
  it('cruce de medianoche 22:00→02:00 cubre [22,24) ∪ [0,2)', () => {
    expect(withinTimeWindow('22:00:00', '02:00:00', at(23))).toBe(true);
    expect(withinTimeWindow('22:00:00', '02:00:00', at(1))).toBe(true);
    expect(withinTimeWindow('22:00:00', '02:00:00', at(2))).toBe(false); // exclusivo
    expect(withinTimeWindow('22:00:00', '02:00:00', at(21))).toBe(false);
    expect(withinTimeWindow('22:00:00', '02:00:00', at(12))).toBe(false);
  });
  it('start === end = ventana vacía (defensivo)', () => {
    expect(withinTimeWindow('12:00:00', '12:00:00', at(12))).toBe(false);
  });

  /**
   * Una promo «todo el día» se guarda como 00:00:00 → 23:59:59, y con la
   * ventana [inicio, fin) el último segundo del día queda AFUERA. No es un
   * descuido que se pueda tapar: `HH:MM:SS` no admite `24:00:00`, así que
   * ninguna ventana llega a cubrir los 86.400 segundos.
   *
   * Queda fijado acá porque el agujero es invisible —un segundo al día— hasta
   * que algo lo cruza: la simulación financiera fallaba al azar, de noche, con
   * un descuadre de plata que no era de plata. En el local, ese segundo cae en
   * la madrugada y no cambia una venta real; si algún día importara, la salida
   * NO es tocar esta comparación (el ramo de cruce de medianoche depende de
   * ella) sino admitir un fin de ventana abierto.
   */
  it('una ventana de «todo el día» deja fuera el último segundo (00:00:00→23:59:59)', () => {
    const alSegundo = (h: number, m: number, sec: number) => new Date(2026, 4, 4, h, m, sec);
    expect(withinTimeWindow('00:00:00', '23:59:59', alSegundo(23, 59, 58))).toBe(true);
    expect(withinTimeWindow('00:00:00', '23:59:59', alSegundo(23, 59, 59))).toBe(false);
    expect(withinTimeWindow('00:00:00', '23:59:59', alSegundo(0, 0, 0))).toBe(true);
  });
});

describe('getDayOfWeekBit + máscara de días', () => {
  it('mapea el día calendario local al bit correcto', () => {
    expect(getDayOfWeekBit(new Date(2026, 4, 4))).toBe(DAY_BIT.MONDAY); // 4-may-2026 = lunes
    expect(getDayOfWeekBit(new Date(2026, 4, 3))).toBe(DAY_BIT.SUNDAY);
    expect(getDayOfWeekBit(new Date(2026, 4, 9))).toBe(DAY_BIT.SATURDAY);
  });
  it('la promo NO aplica si su máscara excluye el día de la venta', () => {
    const monday = new Date(2026, 4, 4, 15, 0, 0);
    const base = {
      id: 'd',
      type: 'PERCENT_OFF' as const,
      discountPct: 0.1,
      timeStart: '00:00:00',
      timeEnd: '23:59:59',
      activeFrom: null,
      activeTo: null,
      productIds: new Set(['p1']),
    };
    // Solo martes (bit 2): un lunes NO aplica.
    const onlyTue: PromotionDef = { ...base, daysOfWeekMask: DAY_BIT.TUESDAY };
    eq(applyPromotion(input({ at: monday }), [onlyTue]).lineDiscount, 0);
    // Incluye lunes: SÍ aplica.
    const withMon: PromotionDef = { ...base, daysOfWeekMask: DAY_BIT.MONDAY | DAY_BIT.TUESDAY };
    eq(applyPromotion(input({ at: monday }), [withMon]).lineDiscount, 1000);
  });
});
