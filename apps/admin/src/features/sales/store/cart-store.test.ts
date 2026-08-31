import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from './cart-store';

const base = {
  productId: 'p1',
  productName: 'Hamburguesa',
  size: null,
  modifiers: [],
  quantity: 1,
  unitPrice: 18000,
  isCombo: false,
};

beforeEach(() => {
  useCartStore.setState({ items: [], lineDiscounts: {} });
});

describe('duplicar una línea del carrito', () => {
  /**
   * El problema que resuelve: dos hamburguesas en una línea de cantidad 2
   * comparten UNA sola nota, así que "una sin cebolla" no se podía escribir.
   */
  it('crea otra línea en vez de subir la cantidad', () => {
    useCartStore.getState().addItem(base);
    const original = useCartStore.getState().items[0]!;
    useCartStore.getState().duplicateLine(original.lineId);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.quantity === 1)).toBe(true);
    expect(items[0]!.lineId).not.toBe(items[1]!.lineId);
  });

  it('la copia queda JUNTO a la original, no al final', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().addItem({ ...base, productId: 'p2', productName: 'Gaseosa' });
    const primera = useCartStore.getState().items[0]!;
    useCartStore.getState().duplicateLine(primera.lineId);

    expect(useCartStore.getState().items.map((i) => i.productName)).toEqual([
      'Hamburguesa',
      'Hamburguesa',
      'Gaseosa',
    ]);
  });

  it('la copia nace SIN la nota de la original (es otra unidad)', () => {
    useCartStore.getState().addItem({ ...base, notes: 'sin cebolla' });
    const original = useCartStore.getState().items[0]!;
    useCartStore.getState().duplicateLine(original.lineId);

    const [uno, dos] = useCartStore.getState().items;
    expect(uno!.notes).toBe('sin cebolla');
    expect(dos!.notes).toBeUndefined();
  });

  it('cada copia puede llevar su propia nota', () => {
    useCartStore.getState().addItem(base);
    const original = useCartStore.getState().items[0]!;
    useCartStore.getState().duplicateLine(original.lineId);
    const [uno, dos] = useCartStore.getState().items;

    useCartStore.getState().setNotes(uno!.lineId, 'sin cebolla');
    useCartStore.getState().setNotes(dos!.lineId, 'término medio');

    expect(useCartStore.getState().items.map((i) => i.notes)).toEqual([
      'sin cebolla',
      'término medio',
    ]);
  });

  it('duplicar una línea que ya no existe no rompe el carrito', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().duplicateLine('no-existe');
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
