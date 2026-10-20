/**
 * Las reglas de la pantalla para los combos con componentes con variante
 * (PLAN-COMBO-CON-VARIANTE.md, entrega 2). Espejan lo que el servidor exige:
 * si la pantalla y el servidor discrepan, el dueño ve un formulario que acepta
 * algo que al guardar se rechaza.
 */
import type { Product } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { combosSinVariante, precioDeComponente, tieneVariantes } from './combo-variantes';

const producto = (p: Partial<Product> & { id: string; name: string }): Product =>
  ({
    basePrice: 0,
    isActive: true,
    isCombo: false,
    sizes: [],
    comboComponents: [],
    choiceGroups: [],
    ...p,
  }) as Product;

const papas = producto({
  id: 'papas',
  name: 'Papas TERCOS',
  basePrice: 25_000,
  sizes: [
    { id: 's-pollo', productId: 'papas', name: 'Pollo y Miel ahumada', priceModifier: 0, sortOrder: 0 },
    { id: 's-carne', productId: 'papas', name: 'Carne smash doble', priceModifier: 3000, sortOrder: 1 },
  ],
});
const sandwich = producto({ id: 'sandwich', name: 'Sandwich', basePrice: 18_000 });
const combo = (id: string, extra: Partial<Product>) =>
  producto({ id, name: `Combo ${id}`, isCombo: true, comboPrice: 40_000, ...extra });

describe('tieneVariantes', () => {
  it('un plato con tamaños tiene variantes; uno sin tamaños no', () => {
    expect(tieneVariantes(papas)).toBe(true);
    expect(tieneVariantes(sandwich)).toBe(false);
    expect(tieneVariantes(producto({ id: 'x', name: 'x', sizes: undefined }))).toBe(false);
  });
});

describe('precioDeComponente', () => {
  it('suma el recargo de la variante elegida al precio del plato', () => {
    expect(precioDeComponente(papas, 's-carne')).toBe(28_000);
    expect(precioDeComponente(papas, 's-pollo')).toBe(25_000);
  });

  it('sin variante (o una que no es del plato) queda el precio base', () => {
    expect(precioDeComponente(papas, '')).toBe(25_000);
    expect(precioDeComponente(papas, 'otra')).toBe(25_000);
    expect(precioDeComponente(sandwich, '')).toBe(18_000);
  });
});

describe('combosSinVariante', () => {
  it('lista el combo cuyo componente tiene variantes y el combo no dice cuál', () => {
    const roto = combo('a', { comboComponents: [{ id: 'c1', comboId: 'a', productId: 'papas', quantity: 2 }] });
    expect(combosSinVariante([papas, sandwich, roto])).toEqual([
      { id: 'a', name: 'Combo a', faltaVariante: ['Papas TERCOS'], opcionesConVariantes: [] },
    ]);
  });

  it('un combo con la variante elegida, o con platos sin variantes, está bien', () => {
    const bien = combo('b', {
      comboComponents: [
        { id: 'c1', comboId: 'b', productId: 'papas', sizeId: 's-pollo', quantity: 2 },
        { id: 'c2', comboId: 'b', productId: 'sandwich', quantity: 1 },
      ],
    });
    expect(combosSinVariante([papas, sandwich, bien])).toEqual([]);
  });

  it('una OPCIÓN a elegir con variantes también se avisa (esa opción queda apagada)', () => {
    const conOpcion = combo('d', {
      choiceGroups: [
        {
          id: 'g',
          comboId: 'd',
          label: 'Plato',
          quantity: 1,
          sortOrder: 0,
          options: [
            { id: 'o1', groupId: 'g', productId: 'papas', productName: 'Papas TERCOS', priceDelta: 0, sortOrder: 0 },
            { id: 'o2', groupId: 'g', productId: 'sandwich', productName: 'Sandwich', priceDelta: 0, sortOrder: 1 },
          ],
        },
      ],
    } as Partial<Product>);
    expect(combosSinVariante([papas, sandwich, conOpcion])).toEqual([
      { id: 'd', name: 'Combo d', faltaVariante: [], opcionesConVariantes: ['Papas TERCOS'] },
    ]);
  });

  it('un combo desactivado no se avisa: no se vende', () => {
    const inactivo = combo('c', {
      isActive: false,
      comboComponents: [{ id: 'c1', comboId: 'c', productId: 'papas', quantity: 1 }],
    });
    expect(combosSinVariante([papas, inactivo])).toEqual([]);
  });
});
