import { describe, expect, it } from 'vitest';
import type { Promotion } from '@pos-tercos/types';
import { useCartStore } from '../store/cart-store';
import { computeCartTotals } from './totals';

/**
 * La razón por la que los productos iguales SÍ se agrupan.
 *
 * Una promo 2x1 se calcula POR LÍNEA (`Math.floor(cantidad / tamaño)`), así que
 * dos gaseosas en líneas sueltas NO dispararían el descuento y el cliente
 * pagaría de más. Al quitar el agrupado (2026-08-31) eso quedó expuesto; estos
 * casos fijan que no vuelva a pasar sin que nadie se entere.
 *
 * El motor de promociones NO se tocó: se prueba tal cual está.
 */
const PRECIO = 5_000;

const bebida = {
  productId: 'gaseosa',
  productName: 'Gaseosa',
  size: null,
  modifiers: [],
  quantity: 1,
  unitPrice: PRECIO,
  isCombo: false,
};

const dosPorUno: Promotion = {
  id: 'promo-2x1',
  name: '2x1 en gaseosas',
  type: 'BOGO',
  discountPct: null,
  discountFixed: null,
  bogoBuyQty: 1,
  bogoGetQty: 1,
  daysOfWeekMask: 127, // los 7 días
  // Una promo "todo el día" se guarda así: `withinTimeWindow` compara cadenas
  // y con null === null devuelve false, o sea que nunca aplicaría.
  timeStart: '00:00:00',
  timeEnd: '23:59:59',
  activeFrom: null,
  activeTo: null,
  isActive: true,
  channel: 'BOTH',
  productIds: ['gaseosa'],
  createdAt: new Date().toISOString(),
} as unknown as Promotion;

/** Mediodía fijo: a las 23:59:59 ninguna promo «todo el día» aplica (la ventana
 *  se evalúa como [inicio, fin)), y el test no puede depender del reloj. */
const MEDIODIA = new Date(2026, 8, 1, 12, 0, 0);

const totalDelCarrito = (): number => {
  const { items, lineDiscounts, orderDiscount } = useCartStore.getState();
  return computeCartTotals(items, [dosPorUno], MEDIODIA, { lineDiscounts, orderDiscount }).total;
};

describe('un 2x1 sigue aplicando con el agrupado de vuelta', () => {
  it('dos toques de la misma bebida cobran UNA (el descuento se aplica)', () => {
    useCartStore.setState({ items: [], lineDiscounts: {}, orderDiscount: null });
    useCartStore.getState().addItem(bebida);
    useCartStore.getState().addItem(bebida);

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(totalDelCarrito()).toBe(PRECIO);
  });

  it('cuatro toques cobran dos', () => {
    useCartStore.setState({ items: [], lineDiscounts: {}, orderDiscount: null });
    for (let i = 0; i < 4; i++) useCartStore.getState().addItem(bebida);
    expect(totalDelCarrito()).toBe(PRECIO * 2);
  });

  it('separarlas a mano SÍ pierde el 2x1 — es el costo de partir una línea', () => {
    useCartStore.setState({ items: [], lineDiscounts: {}, orderDiscount: null });
    useCartStore.getState().addItem(bebida);
    useCartStore.getState().addItem(bebida);
    useCartStore.getState().separarLinea(useCartStore.getState().items[0]!.lineId);

    // Queda documentado a propósito: si alguna vez se quiere que el 2x1
    // sobreviva a la separación, hay que agrupar por producto en el motor —
    // en la caja Y en el servidor, que recalcula el total.
    expect(useCartStore.getState().items).toHaveLength(2);
    expect(totalDelCarrito()).toBe(PRECIO * 2);
  });
});

/**
 * El monto fijo, visto desde el carrito de la caja (no desde el motor suelto):
 * el total tiene que ser el mismo esté la cantidad junta o repartida.
 */
describe('un descuento de monto fijo no cambia según el reparto', () => {
  const dosMilMenos: Promotion = {
    ...dosPorUno,
    id: 'promo-fija',
    name: '$2.000 en gaseosas',
    type: 'FIXED_OFF',
    bogoBuyQty: null,
    bogoGetQty: null,
    discountFixed: 2_000,
  } as unknown as Promotion;

  const total = (): number => {
    const { items, lineDiscounts, orderDiscount } = useCartStore.getState();
    return computeCartTotals(items, [dosMilMenos], MEDIODIA, { lineDiscounts, orderDiscount })
      .total;
  };

  it('tres juntas y tres separadas cuestan lo mismo', () => {
    useCartStore.setState({ items: [], lineDiscounts: {}, orderDiscount: null });
    for (let i = 0; i < 3; i++) useCartStore.getState().addItem(bebida);
    const juntas = total();

    useCartStore.getState().separarLinea(useCartStore.getState().items[0]!.lineId);
    expect(useCartStore.getState().items).toHaveLength(3);
    expect(total()).toBe(juntas);
    // $5.000 cada una menos $2.000 por unidad = $3.000 × 3.
    expect(juntas).toBe(9_000);
  });
});
