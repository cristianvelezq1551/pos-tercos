/**
 * Tests del motor extendido (FASE 12.A): PERCENT_OFF + FIXED_OFF + BOGO + COMBO_OFF.
 * Migrado a Vitest en FASE 14.E.
 * Ejecutar con `pnpm -F @pos-tercos/domain test`.
 */

import { describe, it, expect } from 'vitest';
import { applyPromotion } from './apply-promotions';
import type { ApplyPromotionInput, PromotionDef } from './types';

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

}); // describe('applyPromotion')
