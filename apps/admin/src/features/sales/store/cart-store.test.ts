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

/**
 * Los productos iguales YA NO se agrupan.
 *
 * Agrupar obligaba a un botón aparte para "otro con nota distinta", y ese botón
 * AGREGABA una unidad en vez de separar las que ya había: con dos sándwiches,
 * pedir otra nota dejaba tres. Sin agrupar, otra nota es tocar el producto otra
 * vez, y la cantidad solo sube si alguien aprieta «+» a propósito.
 */
describe('el carrito no agrupa productos iguales', () => {
  it('dos toques del mismo producto son DOS líneas de a uno', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().addItem(base);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.quantity === 1)).toBe(true);
    expect(items[0]!.lineId).not.toBe(items[1]!.lineId);
  });

  it('cada línea lleva su propia nota, sin pasos extra', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().addItem(base);
    const [a, b] = useCartStore.getState().items;
    useCartStore.getState().setNotes(a!.lineId, 'sin cebolla');

    const items = useCartStore.getState().items;
    expect(items[0]!.notes).toBe('sin cebolla');
    expect(items[1]!.notes).toBeUndefined();
    expect(b).toBeDefined();
  });

  it('la cantidad solo sube si se aprieta «+»', () => {
    useCartStore.getState().addItem(base);
    const linea = useCartStore.getState().items[0]!;
    useCartStore.getState().updateQty(linea.lineId, 3);

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]!.quantity).toBe(3);
  });
});

describe('separar una línea que alguien juntó con «+»', () => {
  it('una línea de 3 pasa a 3 líneas de 1', () => {
    useCartStore.getState().addItem({ ...base, quantity: 3 });
    const linea = useCartStore.getState().items[0]!;
    useCartStore.getState().separarLinea(linea.lineId);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.quantity === 1)).toBe(true);
    expect(new Set(items.map((i) => i.lineId)).size).toBe(3);
  });

  it('no cambia lo que se vende: misma cantidad total y mismo precio', () => {
    useCartStore.getState().addItem({ ...base, quantity: 4 });
    const antes = useCartStore.getState().items;
    const totalAntes = antes.reduce((a, i) => a + i.quantity * i.unitPrice, 0);

    useCartStore.getState().separarLinea(antes[0]!.lineId);
    const despues = useCartStore.getState().items;

    expect(despues.reduce((a, i) => a + i.quantity, 0)).toBe(4);
    expect(despues.reduce((a, i) => a + i.quantity * i.unitPrice, 0)).toBe(totalAntes);
  });

  it('la nota queda en la primera; las otras nacen limpias', () => {
    useCartStore.getState().addItem({ ...base, quantity: 2, notes: 'sin cebolla' });
    const linea = useCartStore.getState().items[0]!;
    useCartStore.getState().separarLinea(linea.lineId);

    const items = useCartStore.getState().items;
    expect(items[0]!.notes).toBe('sin cebolla');
    expect(items[1]!.notes).toBeUndefined();
  });

  it('las líneas separadas quedan JUNTAS, en el lugar de la original', () => {
    useCartStore.getState().addItem({ ...base, productId: 'p0', productName: 'Gaseosa' });
    useCartStore.getState().addItem({ ...base, quantity: 2 });
    useCartStore.getState().addItem({ ...base, productId: 'p2', productName: 'Papas' });
    const objetivo = useCartStore.getState().items[1]!;
    useCartStore.getState().separarLinea(objetivo.lineId);

    const nombres = useCartStore.getState().items.map((i) => i.productName);
    expect(nombres).toEqual(['Gaseosa', 'Hamburguesa', 'Hamburguesa', 'Papas']);
  });

  it('una línea de 1 no se separa (no hay nada que repartir)', () => {
    useCartStore.getState().addItem(base);
    const linea = useCartStore.getState().items[0]!;
    useCartStore.getState().separarLinea(linea.lineId);
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('un id que no existe no rompe nada', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().separarLinea('no-existe');
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
