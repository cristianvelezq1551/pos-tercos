import { describe, expect, it } from 'vitest';
import type { PublicMenuProduct } from '@pos-tercos/types';
import type { CartLine } from './cart-types';
import { hasReconcileChanges, reconcileCart } from './reconcile';

function product(over: Partial<PublicMenuProduct> = {}): PublicMenuProduct {
  return {
    id: 'p1',
    name: 'Burger',
    description: null,
    basePrice: 20000,
    category: null,
    imageUrl: null,
    modifiersEnabled: true,
    isCombo: false,
    comboPrice: null,
    sizes: [],
    modifiers: [],
    ...over,
  };
}

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    lineId: 'l1',
    productId: 'p1',
    productName: 'Burger',
    size: null,
    modifiers: [],
    quantity: 1,
    unitPrice: 20000,
    ...over,
  };
}

describe('reconcileCart', () => {
  it('sin cambios: precio y producto iguales → carrito intacto, sin cambios', () => {
    const { items, change } = reconcileCart([line()], [product()]);
    expect(items).toHaveLength(1);
    expect(items[0].unitPrice).toBe(20000);
    expect(hasReconcileChanges(change)).toBe(false);
  });

  it('producto desactivado/borrado → se quita y se reporta en removed', () => {
    const { items, change } = reconcileCart([line()], []); // menú sin el producto
    expect(items).toHaveLength(0);
    expect(change.removed).toEqual(['Burger']);
    expect(hasReconcileChanges(change)).toBe(true);
  });

  it('precio base cambió → actualiza la línea y lo reporta en repriced', () => {
    const { items, change } = reconcileCart([line({ unitPrice: 20000 })], [product({ basePrice: 23000 })]);
    expect(items[0].unitPrice).toBe(23000);
    expect(change.repriced).toEqual([{ name: 'Burger', from: 20000, to: 23000 }]);
  });

  it('recalcula con tamaño + modificadores frescos del menú', () => {
    const cartLine = line({
      unitPrice: 20000, // viejo: base sin extras
      size: { id: 's1', name: 'Grande', priceModifier: 3000 },
      modifiers: [{ id: 'm1', name: 'Extra queso', priceDelta: 2000 }],
    });
    const menu = product({
      basePrice: 20000,
      sizes: [{ id: 's1', name: 'Grande', productId: 'p1', priceModifier: 4000, sortOrder: 0 }], // subió
      modifiers: [{ id: 'm1', name: 'Extra queso', productId: 'p1', priceDelta: 2000, recipeDelta: [] }],
    });
    const { items, change } = reconcileCart([cartLine], [menu]);
    // 20000 + 4000 (tamaño nuevo) + 2000 (mod) = 26000
    expect(items[0].unitPrice).toBe(26000);
    expect(change.repriced[0].to).toBe(26000);
  });

  it('usa comboPrice cuando isCombo', () => {
    const cartLine = line({ productId: 'c1', productName: 'Combo', unitPrice: 30000 });
    const combo = product({ id: 'c1', name: 'Combo', isCombo: true, comboPrice: 28000, basePrice: 0 });
    const { items } = reconcileCart([cartLine], [combo]);
    expect(items[0].unitPrice).toBe(28000);
  });

  it('reporta removed y repriced juntos en un carrito mixto', () => {
    const a = line({ lineId: 'a', productId: 'p1', productName: 'Burger', unitPrice: 20000 });
    const b = line({ lineId: 'b', productId: 'p2', productName: 'Fantasma', unitPrice: 5000 });
    const menu = [product({ id: 'p1', basePrice: 21000 })]; // p2 ya no existe
    const { items, change } = reconcileCart([a, b], menu);
    expect(items).toHaveLength(1);
    expect(change.removed).toEqual(['Fantasma']);
    expect(change.repriced).toEqual([{ name: 'Burger', from: 20000, to: 21000 }]);
  });
});
