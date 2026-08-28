import { applyPromotion, type PromotionDef } from '@pos-tercos/domain';
import type { PublicMenuPromotion } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { computeCartPromoTotals, getMenuPromoBadge } from './promo';

/**
 * §4.9: el preview de promos de la WEB es el precio que VE el cliente. Si diverge
 * del motor del backend (mismo `applyPromotion` de domain), el total "cambia" al
 * confirmar el pedido. Estos tests fijan que el cálculo web == el de domain con
 * los mismos fixtures.
 */
const PROD = '00000000-0000-4000-8000-0000000000a1';
const AT = new Date('2026-05-04T15:00:00'); // lunes, mediodía

const promo = (over: Partial<PublicMenuPromotion> = {}): PublicMenuPromotion => ({
  id: '00000000-0000-4000-8000-0000000000f1',
  name: 'Promo',
  type: 'PERCENT_OFF',
  discountPct: 0.2,
  discountFixed: null,
  bogoBuyQty: null,
  bogoGetQty: null,
  daysOfWeekMask: 127,
  timeStart: '00:00:00',
  timeEnd: '23:59:59',
  activeFrom: null,
  activeTo: null,
  productIds: [PROD],
  ...over,
});

/** El mismo cálculo, pero por el motor de domain directo (la "verdad"). */
function domainDiscount(p: PublicMenuPromotion, lineSubtotal: number, quantity: number): number {
  const def: PromotionDef = {
    id: p.id,
    type: p.type,
    discountPct: p.discountPct ?? undefined,
    discountFixed: p.discountFixed ?? undefined,
    bogoBuyQty: p.bogoBuyQty ?? undefined,
    bogoGetQty: p.bogoGetQty ?? undefined,
    daysOfWeekMask: p.daysOfWeekMask,
    timeStart: p.timeStart,
    timeEnd: p.timeEnd,
    activeFrom: p.activeFrom,
    activeTo: p.activeTo,
    productIds: new Set(p.productIds),
  };
  return applyPromotion({ productId: PROD, lineSubtotal, quantity, isCombo: false, at: AT }, [def])
    .lineDiscount;
}

describe('computeCartPromoTotals (web) == motor de domain', () => {
  it('PERCENT_OFF: el descuento web coincide con el de domain', () => {
    const p = promo({ discountPct: 0.2 });
    const r = computeCartPromoTotals([{ productId: PROD, quantity: 2, unitPrice: 8_950 }], [p], AT);
    expect(r.discount).toBe(domainDiscount(p, 17_900, 2));
    expect(r.total).toBe(r.subtotal - r.discount);
  });

  it('FIXED_OFF capado al subtotal, igual que domain', () => {
    const p = promo({ type: 'FIXED_OFF', discountPct: null, discountFixed: 3_000 });
    const r = computeCartPromoTotals([{ productId: PROD, quantity: 1, unitPrice: 8_950 }], [p], AT);
    expect(r.discount).toBe(domainDiscount(p, 8_950, 1));
  });

  it('promo fuera de la ventana horaria no aplica (ni web ni domain)', () => {
    const p = promo({ timeStart: '18:00:00', timeEnd: '20:00:00' }); // AT = 15:00 → fuera
    const r = computeCartPromoTotals([{ productId: PROD, quantity: 1, unitPrice: 10_000 }], [p], AT);
    expect(r.discount).toBe(0);
    expect(domainDiscount(p, 10_000, 1)).toBe(0);
  });

  it('activeTo en su último día SÍ aplica (TZ-independiente, §0.6)', () => {
    const p = promo({ activeTo: '2026-05-04' }); // el mismo día de AT
    const r = computeCartPromoTotals([{ productId: PROD, quantity: 1, unitPrice: 10_000 }], [p], AT);
    expect(r.discount).toBe(2_000);
  });

  it('getMenuPromoBadge devuelve el precio tachado coherente', () => {
    const badge = getMenuPromoBadge(PROD, 10_000, [promo({ discountPct: 0.2 })], AT);
    expect(badge?.discountedPrice).toBe(8_000);
  });
  /**
   * El backend cobra COMBO_OFF con `Product.isCombo`; la web lo tenía fijo en
   * false, así que el combo se mostraba a precio lleno y el total cambiaba
   * recién al confirmar el pedido.
   */
  describe('COMBO_OFF', () => {
    const comboPromo = promo({ type: 'COMBO_OFF', discountPct: 0.15, discountFixed: null });

    it('descuenta cuando la línea es de un combo', () => {
      const r = computeCartPromoTotals(
        [{ productId: PROD, quantity: 1, unitPrice: 30_000, isCombo: true }],
        [comboPromo],
        AT,
      );
      expect(r.discount).toBe(4_500);
      expect(r.total).toBe(25_500);
    });

    it('no descuenta si el producto no es combo', () => {
      const r = computeCartPromoTotals(
        [{ productId: PROD, quantity: 1, unitPrice: 30_000, isCombo: false }],
        [comboPromo],
        AT,
      );
      expect(r.discount).toBe(0);
    });

    it('la tarjeta del menú muestra el tachado del combo', () => {
      expect(getMenuPromoBadge(PROD, 30_000, [comboPromo], AT, true)?.discountedPrice).toBe(25_500);
      expect(getMenuPromoBadge(PROD, 30_000, [comboPromo], AT, false)).toBeNull();
    });
  });
});
