import { describe, expect, it } from 'vitest';
import { getPromoBadge } from './promo-badge';
import type { PromotionDef } from './types';

const NOW = new Date('2026-05-04T15:00:00');

const PROMO_BASE = {
  daysOfWeekMask: 127,
  timeStart: '00:00:00',
  timeEnd: '23:59:59',
  activeFrom: null,
  activeTo: null,
} as const;

describe('getPromoBadge', () => {
  it('PERCENT_OFF 20% → label "−20%" y precio tachado', () => {
    const defs: PromotionDef[] = [
      {
        ...PROMO_BASE,
        id: 'pct1',
        type: 'PERCENT_OFF',
        discountPct: 0.2,
        productIds: new Set(['p1']),
      },
    ];
    const b = getPromoBadge('p1', 27000, defs, NOW);
    expect(b).not.toBeNull();
    expect(b!.label).toBe('−20%');
    expect(b!.kind).toBe('discount');
    expect(b!.discountedPrice).toBe(21600);
  });

  it('FIXED_OFF $2.700 → label con monto y precio tachado', () => {
    const defs: PromotionDef[] = [
      {
        ...PROMO_BASE,
        id: 'fix1',
        type: 'FIXED_OFF',
        discountFixed: 2700,
        productIds: new Set(['p1']),
      },
    ];
    const b = getPromoBadge('p1', 10000, defs, NOW);
    expect(b!.kind).toBe('discount');
    expect(b!.discountedPrice).toBe(7300);
  });

  it('BOGO 2+1 → badge "Compra 2 lleva 3" sin precio tachado', () => {
    const defs: PromotionDef[] = [
      {
        ...PROMO_BASE,
        id: 'bogo1',
        type: 'BOGO',
        bogoBuyQty: 2,
        bogoGetQty: 1,
        productIds: new Set(['p1']),
      },
    ];
    const b = getPromoBadge('p1', 5000, defs, NOW);
    expect(b!.label).toBe('Compra 2 lleva 3');
    expect(b!.kind).toBe('bogo');
    expect(b!.discountedPrice).toBeNull();
  });

  it('producto sin promo matching → null', () => {
    const defs: PromotionDef[] = [
      {
        ...PROMO_BASE,
        id: 'pct1',
        type: 'PERCENT_OFF',
        discountPct: 0.2,
        productIds: new Set(['otro']),
      },
    ];
    expect(getPromoBadge('p1', 10000, defs, NOW)).toBeNull();
  });

  it('sin defs o precio 0 → null', () => {
    expect(getPromoBadge('p1', 10000, [], NOW)).toBeNull();
    expect(getPromoBadge('p1', 0, [], NOW)).toBeNull();
  });
});

describe('getPromoBadge — precio fijo y variantes', () => {
  it('FIXED_PRICE → "Hoy $22.000" y precio tachado al precio fijo', () => {
    const defs: PromotionDef[] = [
      { ...PROMO_BASE, id: 'fp', type: 'FIXED_PRICE', fixedPrice: 22_000, productIds: new Set(['p1']) },
    ];
    const b = getPromoBadge('p1', 27_000, defs, NOW, false, { unitBasePrice: 27_000 });
    expect(b).not.toBeNull();
    expect(b!.label).toBe('Hoy $22.000');
    expect(b!.kind).toBe('discount');
    expect(b!.discountedPrice).toBe(22_000);
  });

  it('FIXED_PRICE con el producto más barato que el precio fijo → sin badge', () => {
    const defs: PromotionDef[] = [
      { ...PROMO_BASE, id: 'fp', type: 'FIXED_PRICE', fixedPrice: 22_000, productIds: new Set(['p1']) },
    ];
    expect(getPromoBadge('p1', 20_000, defs, NOW, false, { unitBasePrice: 20_000 })).toBeNull();
  });

  it('promo limitada a una variante: NADA en la tarjeta, badge al elegir ese tamaño', () => {
    const defs: PromotionDef[] = [
      {
        ...PROMO_BASE,
        id: 'var',
        type: 'PERCENT_OFF',
        discountPct: 0.2,
        productIds: new Set(['papas']),
        sizeIdsByProduct: new Map([['papas', new Set(['pollo'])]]),
      },
    ];
    // La tarjeta no sabe el tamaño: no promete un descuento que la otra variante no tiene.
    expect(getPromoBadge('papas', 25_000, defs, NOW)).toBeNull();
    expect(getPromoBadge('papas', 25_000, defs, NOW, false, { sizeId: 'carne' })).toBeNull();
    const b = getPromoBadge('papas', 25_000, defs, NOW, false, { sizeId: 'pollo' });
    expect(b?.label).toBe('−20%');
    expect(b?.discountedPrice).toBe(20_000);
  });
});
