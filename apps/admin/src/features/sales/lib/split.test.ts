import { describe, expect, it } from 'vitest';
import {
  amountsFromUnits,
  equalSplitAmounts,
  explodeUnits,
  rederiveUnits,
  totalChange,
  unitsSignature,
  validateSplit,
  type SplitPart,
} from './split';
import type { CartTotalsResult } from './totals';

const part = (over: Partial<SplitPart> = {}): SplitPart => ({
  index: 1,
  amount: 10_000,
  method: 'CASH',
  cashReceived: 10_000,
  verified: false,
  ...over,
});

describe('equalSplitAmounts', () => {
  it('divide exacto cuando el total es múltiplo de n', () => {
    expect(equalSplitAmounts(30_000, 3)).toEqual([10_000, 10_000, 10_000]);
  });

  it('reparte el remanente $1 a las primeras partes y la suma es EXACTA', () => {
    const parts = equalSplitAmounts(10_001, 3);
    expect(parts).toEqual([3334, 3334, 3333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_001);
  });

  it('con n=1 devuelve el total completo', () => {
    expect(equalSplitAmounts(45_700, 1)).toEqual([45_700]);
  });
});

describe('explodeUnits / amountsFromUnits', () => {
  const totals: CartTotalsResult = {
    lines: [
      {
        lineId: 'a',
        productName: 'Burger',
        quantity: 3,
        unitPrice: 10_000,
        lineSubtotal: 30_000,
        appliedPromotionId: 'promo',
        lineDiscount: 1_000,
        lineTotal: 29_000, // 29000/3 = 9666.67 → prorrateo con remanente
      },
      {
        lineId: 'b',
        productName: 'Gaseosa',
        quantity: 1,
        unitPrice: 5_000,
        lineSubtotal: 5_000,
        appliedPromotionId: null,
        lineDiscount: 0,
        lineTotal: 5_000,
      },
    ],
    subtotal: 35_000,
    discount: 1_000,
    orderDiscountAmount: 0,
    total: 34_000,
  };

  it('expande a unidades cuya suma = total exacto (promo prorrateada)', () => {
    const units = explodeUnits(totals);
    expect(units).toHaveLength(4);
    expect(units.reduce((a, u) => a + u.amount, 0)).toBe(34_000);
    // El remanente del prorrateo va a las primeras unidades.
    expect(units[0]!.amount).toBeGreaterThanOrEqual(units[2]!.amount);
  });

  it('re-deriva montos por persona desde la asignación de unidades', () => {
    const units = explodeUnits(totals);
    units[0]!.assignedTo = 1;
    units[1]!.assignedTo = 2;
    units[2]!.assignedTo = 2;
    units[3]!.assignedTo = 1; // gaseosa a persona 1
    const amounts = amountsFromUnits(units, 2);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(34_000);
    expect(amounts[0]).toBe(units[0]!.amount + units[3]!.amount);
  });

  it('clampa asignaciones fuera de rango al rango válido', () => {
    const units = explodeUnits(totals);
    units[0]!.assignedTo = 99;
    const amounts = amountsFromUnits(units, 2);
    expect(amounts[1]).toBeGreaterThanOrEqual(units[0]!.amount);
  });

  // Regresión del bug "split por productos con precios viejos": cuando entra/sale
  // una promo (cambia lineTotal) con la cuenta dividida abierta, las unidades
  // deben re-derivarse con el precio nuevo SIN perder a quién se asignaron.
  it('rederiveUnits actualiza precios y PRESERVA las asignaciones por key', () => {
    const prev = explodeUnits(totals);
    prev.forEach((u) => (u.assignedTo = 2)); // todas a la persona 2

    const cheaper: CartTotalsResult = {
      ...totals,
      lines: [{ ...totals.lines[0]!, lineTotal: 20_000 }, totals.lines[1]!],
      total: 25_000,
    };
    const next = rederiveUnits(cheaper, prev);

    expect(next.reduce((a, u) => a + u.amount, 0)).toBe(25_000); // precio nuevo
    expect(next.every((u) => u.assignedTo === 2)).toBe(true); // asignación preservada
  });

  it('rederiveUnits: una unidad nueva (key no vista) cae a la persona 1', () => {
    const prev = explodeUnits(totals).map((u) => ({ ...u, assignedTo: 2 }));
    const withExtra: CartTotalsResult = {
      ...totals,
      lines: [
        ...totals.lines,
        {
          lineId: 'c',
          productName: 'Papas',
          quantity: 1,
          unitPrice: 6_000,
          lineSubtotal: 6_000,
          appliedPromotionId: null,
          lineDiscount: 0,
          lineTotal: 6_000,
        },
      ],
      total: 40_000,
    };
    const next = rederiveUnits(withExtra, prev);
    const papas = next.find((u) => u.key.startsWith('c:'))!;
    expect(papas.assignedTo).toBe(1); // default para la unidad nueva
  });

  it('unitsSignature cambia solo cuando cambia el contenido (no la referencia)', () => {
    const sig = unitsSignature(totals);
    expect(unitsSignature({ ...totals, lines: [...totals.lines] })).toBe(sig); // misma data → misma firma
    const promoChanged = {
      ...totals,
      lines: [{ ...totals.lines[0]!, lineTotal: 28_000 }, totals.lines[1]!],
    };
    expect(unitsSignature(promoChanged)).not.toBe(sig); // cambió el lineTotal → firma distinta
  });
});

describe('validateSplit', () => {
  it('rechaza cuando faltan o sobran montos', () => {
    expect(validateSplit([part({ amount: 9_000 })], 10_000).ok).toBe(false);
    expect(validateSplit([part({ amount: 11_000, cashReceived: 11_000 })], 10_000).ok).toBe(false);
  });

  it('rechaza parte sin método o efectivo insuficiente', () => {
    expect(validateSplit([part({ method: null })], 10_000).ok).toBe(false);
    expect(validateSplit([part({ cashReceived: 9_999 })], 10_000).ok).toBe(false);
  });

  it('rechaza parte digital sin comprobante verificado y acepta verificada', () => {
    const digital = part({ method: 'TRANSFER', cashReceived: null, verified: false });
    expect(validateSplit([digital], 10_000).ok).toBe(false);
    expect(validateSplit([{ ...digital, verified: true }], 10_000).ok).toBe(true);
  });

  it('acepta una cuenta mixta exacta', () => {
    const parts: SplitPart[] = [
      part({ index: 1, amount: 6_000, cashReceived: 10_000 }),
      part({ index: 2, amount: 4_000, method: 'TRANSFER', cashReceived: null, verified: true }),
    ];
    expect(validateSplit(parts, 10_000)).toEqual({ ok: true, reason: null });
  });
});

describe('totalChange', () => {
  it('suma el vuelto SOLO de las partes en efectivo', () => {
    const parts: SplitPart[] = [
      part({ amount: 6_000, cashReceived: 10_000 }), // vuelto 4000
      part({ index: 2, amount: 4_000, method: 'TRANSFER', cashReceived: null, verified: true }),
    ];
    expect(totalChange(parts)).toBe(4_000);
  });
});
