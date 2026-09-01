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
 * Los productos iguales SIN nota se juntan; con nota, van por su cuenta.
 *
 * Juntarlos no es cosmético: una promo 2x1 se calcula POR LÍNEA, así que si dos
 * gaseosas iguales quedaran en líneas sueltas el descuento NO se aplicaría y el
 * cliente pagaría de más. Y separarlas cuando llevan indicación es lo único que
 * hace falta para que cada una viaje sola a la comanda.
 */
describe('el carrito agrupa lo idéntico y separa lo que lleva nota', () => {
  it('dos toques del mismo producto sin nota son UNA línea de 2', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().addItem(base);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(2);
  });

  it('una nota distinta NO se fusiona con la normal', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().addItem({ ...base, notes: 'sin cebolla' });

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[1]!.notes).toBe('sin cebolla');
  });

  it('un tamaño distinto tampoco se fusiona', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().addItem({ ...base, size: { id: 'g', name: 'Grande', priceModifier: 2000 } });
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('la cantidad también sube apretando «+»', () => {
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

  it('una línea separada NO vuelve a juntarse con un toque nuevo', () => {
    useCartStore.getState().addItem({ ...base, quantity: 2 });
    useCartStore.getState().separarLinea(useCartStore.getState().items[0]!.lineId);
    // Separó a propósito para dar indicaciones distintas: un toque más no puede
    // deshacerlo juntándole una unidad encima.
    useCartStore.getState().addItem(base);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.quantity === 1)).toBe(true);
  });

  it('un id que no existe no rompe nada', () => {
    useCartStore.getState().addItem(base);
    useCartStore.getState().separarLinea('no-existe');
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
