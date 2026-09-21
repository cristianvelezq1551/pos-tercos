import type { Promotion } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import type { CartLine } from './cart-types';
import { computeCartTotals } from './totals';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  lineId: 'l1',
  productId: 'p1',
  productName: 'Burger',
  size: null,
  modifiers: [],
  choices: [],
  choiceLabels: [],
  quantity: 1,
  unitPrice: 10_000,
  isCombo: false,
  ...over,
});

const promo = (over: Partial<Promotion> = {}): Promotion => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Promo test',
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
  channel: 'BOTH',
  isActive: true,
  createdById: null,
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  productIds: ['p1'],
  ...over,
});

// Momento fijo: miércoles 12:00 (dentro de cualquier ventana all-day).
const AT = new Date('2026-06-10T12:00:00');

describe('computeCartTotals', () => {
  it('sin promos: subtotal = total, descuento 0', () => {
    const r = computeCartTotals([line({ quantity: 2 })], [], AT);
    expect(r.subtotal).toBe(20_000);
    expect(r.discount).toBe(0);
    expect(r.total).toBe(20_000);
    expect(r.lines[0]!.appliedPromotionId).toBeNull();
  });

  it('PERCENT_OFF aplica a la línea del producto y descuenta exacto', () => {
    const r = computeCartTotals([line({ quantity: 3 })], [promo()], AT);
    expect(r.subtotal).toBe(30_000);
    expect(r.discount).toBe(6_000); // 20%
    expect(r.total).toBe(24_000);
    expect(r.lines[0]!.appliedPromotionId).toBe(promo().id);
  });

  it('la promo NO toca productos fuera de su lista', () => {
    const r = computeCartTotals(
      [line(), line({ lineId: 'l2', productId: 'p2', productName: 'Otra' })],
      [promo()],
      AT,
    );
    expect(r.lines[0]!.lineDiscount).toBe(2_000);
    expect(r.lines[1]!.lineDiscount).toBe(0);
    expect(r.total).toBe(18_000);
  });

  it('promo inactiva o fuera de ventana horaria no aplica', () => {
    const inactive = computeCartTotals([line()], [promo({ isActive: false })], AT);
    expect(inactive.discount).toBe(0);
    const offHours = computeCartTotals(
      [line()],
      [promo({ timeStart: '18:00:00', timeEnd: '20:00:00' })],
      AT, // 12:00 — fuera de 18-20
    );
    expect(offHours.discount).toBe(0);
  });

  it('BOGO descuenta los ítems gratis por set completo', () => {
    // Compra 2 lleva 1 gratis → con qty 3 hay 1 set → 1 unidad gratis.
    const r = computeCartTotals(
      [line({ quantity: 3 })],
      [promo({ type: 'BOGO', discountPct: null, bogoBuyQty: 2, bogoGetQty: 1 })],
      AT,
    );
    expect(r.discount).toBe(10_000);
    expect(r.total).toBe(20_000);
  });

  it('entre dos promos gana el MAYOR descuento absoluto', () => {
    const pct = promo(); // 20% de 10000 = 2000
    const fixed = promo({
      id: '00000000-0000-4000-8000-000000000002',
      type: 'FIXED_OFF',
      discountPct: null,
      discountFixed: 3_000,
    });
    const r = computeCartTotals([line()], [pct, fixed], AT);
    expect(r.discount).toBe(3_000);
    expect(r.lines[0]!.appliedPromotionId).toBe(fixed.id);
  });

  it('los totales siempre cuadran: total = subtotal − descuento, suma de líneas', () => {
    const r = computeCartTotals(
      [
        line({ quantity: 3, unitPrice: 3_333 }),
        line({ lineId: 'l2', productId: 'p2', unitPrice: 7_777 }),
      ],
      [promo()],
      AT,
    );
    expect(r.total).toBeCloseTo(r.subtotal - r.discount, 2);
    expect(r.lines.reduce((a, l) => a + l.lineTotal, 0)).toBeCloseTo(r.total, 2);
  });

  // COMBO_OFF (auditoría §0.7): el preview del carrito DEBE aplicar el mismo
  // descuento que cobra el backend. El bug histórico: isCombo estaba fijo en
  // false → el combo se cobraba con descuento pero se mostraba sin él →
  // descuadre de caja en efectivo. El motor solo aplica si la línea es combo.
  it('COMBO_OFF aplica si la línea es combo (isCombo=true)', () => {
    const combo = promo({ type: 'COMBO_OFF', discountPct: 0.15, discountFixed: null });
    const r = computeCartTotals([line({ isCombo: true })], [combo], AT);
    expect(r.discount).toBe(1_500); // 15% de 10.000
    expect(r.lines[0]!.appliedPromotionId).toBe(combo.id);
  });

  it('COMBO_OFF NO aplica si la línea no es combo (isCombo=false)', () => {
    const combo = promo({ type: 'COMBO_OFF', discountPct: 0.15, discountFixed: null });
    const r = computeCartTotals([line({ isCombo: false })], [combo], AT);
    expect(r.discount).toBe(0);
    expect(r.lines[0]!.appliedPromotionId).toBeNull();
  });
});

describe('computeCartTotals — descuento manual (#5b)', () => {
  it('descuento manual por línea desactiva las promos (excluyente)', () => {
    const r = computeCartTotals([line()], [promo()], AT, {
      lineDiscounts: { l1: { kind: 'FIXED', value: 2_000 } },
      orderDiscount: null,
    });
    expect(r.lines[0]!.appliedPromotionId).toBeNull();
    expect(r.lines[0]!.lineDiscount).toBe(2_000);
    expect(r.discount).toBe(2_000);
    expect(r.total).toBe(8_000);
  });

  it('descuento sobre el total se aplica después de los de línea', () => {
    const r = computeCartTotals(
      [line({ quantity: 2 })], // subtotal 20.000
      [],
      AT,
      {
        // $5.000 POR CADA UNIDAD (igual que la promo de monto fijo): 2 × 5.000 = 10.000.
        lineDiscounts: { l1: { kind: 'FIXED', value: 5_000 } },
        orderDiscount: { kind: 'PERCENT', value: 10 }, // 10% de los 10.000 que quedan
      },
    );
    expect(r.orderDiscountAmount).toBe(1_000);
    expect(r.discount).toBe(11_000);
    expect(r.total).toBe(9_000);
  });

  it('el monto fijo de línea es por unidad: el reparto no cambia el total', () => {
    const juntas = computeCartTotals([line({ quantity: 3 })], [], AT, {
      lineDiscounts: { l1: { kind: 'FIXED', value: 2_000 } },
      orderDiscount: null,
    });
    const sueltas = computeCartTotals(
      [line({ lineId: 'a' }), line({ lineId: 'b' }), line({ lineId: 'c' })],
      [],
      AT,
      {
        lineDiscounts: {
          a: { kind: 'FIXED', value: 2_000 },
          b: { kind: 'FIXED', value: 2_000 },
          c: { kind: 'FIXED', value: 2_000 },
        },
        orderDiscount: null,
      },
    );
    expect(juntas.discount).toBe(6_000);
    expect(juntas.total).toBe(sueltas.total);
  });

  it('sin descuentos manuales las promos corren normal', () => {
    const r = computeCartTotals([line()], [promo()], AT, {
      lineDiscounts: {},
      orderDiscount: null,
    });
    expect(r.lines[0]!.appliedPromotionId).not.toBeNull();
    expect(r.discount).toBe(2_000); // 20% de 10.000
    expect(r.orderDiscountAmount).toBe(0);
  });

  it('descuento FIXED sobre el total se capa al total restante', () => {
    const r = computeCartTotals([line()], [], AT, {
      lineDiscounts: {},
      orderDiscount: { kind: 'FIXED', value: 99_000 },
    });
    expect(r.total).toBe(0);
    expect(r.discount).toBe(10_000);
  });
});

describe('promos por variante y precio fijo (caja = servidor)', () => {
  const PAPAS = 'papas';
  const POLLO = 'pollo';
  const CARNE = 'carne';
  const conTamano = (sizeId: string, priceModifier: number, over: Partial<CartLine> = {}): CartLine =>
    line({
      lineId: `l-${sizeId}`,
      productId: PAPAS,
      productName: 'Papas TERCOS',
      size: { id: sizeId, name: sizeId, priceModifier },
      unitPrice: 25_000 + priceModifier,
      ...over,
    });

  it('la promo limitada a "Pollo" descuenta esa variante y deja la otra en precio lleno', () => {
    const promos = [promo({ productIds: [PAPAS], sizeIdsByProduct: { [PAPAS]: [POLLO] } })];
    const t = computeCartTotals([conTamano(POLLO, 0), conTamano(CARNE, 3000)], promos, new Date(2026, 8, 21, 12));
    expect(t.lines[0].lineDiscount).toBe(5000);
    expect(t.lines[1].lineDiscount).toBe(0);
    expect(t.total).toBe(25_000 - 5000 + 28_000);
  });

  it('precio fijo: base = producto con tamaño; el extra se cobra encima', () => {
    const promos = [
      promo({ type: 'FIXED_PRICE', discountPct: null, fixedPrice: 20_000, productIds: [PAPAS] }),
    ];
    const conExtra = conTamano(POLLO, 0, {
      modifiers: [{ id: 'queso', name: 'Queso extra', priceDelta: 3000 }],
      unitPrice: 28_000,
      quantity: 2,
    });
    const t = computeCartTotals([conExtra], promos, new Date(2026, 8, 21, 12));
    // (25.000 − 20.000) × 2 = 10.000; el queso ($3.000 × 2) se paga completo.
    expect(t.lines[0].lineDiscount).toBe(10_000);
    expect(t.total).toBe(56_000 - 10_000);
  });
});
