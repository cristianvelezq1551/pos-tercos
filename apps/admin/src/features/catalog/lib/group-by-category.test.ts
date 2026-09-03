import { describe, expect, it } from 'vitest';
import type { Product } from '@pos-tercos/types';
import { categoriesInOrder, groupByCategory } from './group-by-category';

const p = (name: string, category: string | null): Product =>
  ({ id: name, name, category }) as Product;

describe('groupByCategory', () => {
  it('conserva el orden en que vienen las categorías, no el alfabético', () => {
    // Así las manda el server: en el orden que el dueño armó en /categories.
    const catalogo = [
      p('Smash', 'Hamburguesas'),
      p('Doble', 'Hamburguesas'),
      p('Burro', 'Burros'),
      p('Coca', 'Bebidas'),
    ];
    expect(categoriesInOrder(catalogo)).toEqual(['Hamburguesas', 'Burros', 'Bebidas']);
  });

  it('junta los productos de una categoría aunque vengan salteados', () => {
    const grupos = groupByCategory([
      p('Smash', 'Hamburguesas'),
      p('Coca', 'Bebidas'),
      p('Doble', 'Hamburguesas'),
    ]);
    expect(grupos.map((g) => g.category)).toEqual(['Hamburguesas', 'Bebidas']);
    expect(grupos[0].products.map((x) => x.name)).toEqual(['Smash', 'Doble']);
  });

  it('los productos sin categoría van al final', () => {
    const grupos = groupByCategory([p('Suelto', null), p('Smash', 'Hamburguesas')]);
    expect(grupos.map((g) => g.category)).toEqual(['Hamburguesas', null]);
  });

  it('no pierde ningún producto', () => {
    const catalogo = [p('a', 'X'), p('b', null), p('c', 'Y'), p('d', 'X')];
    const total = groupByCategory(catalogo).reduce((n, g) => n + g.products.length, 0);
    expect(total).toBe(catalogo.length);
  });

  it('sin productos no inventa grupos', () => {
    expect(groupByCategory([])).toEqual([]);
    expect(categoriesInOrder([])).toEqual([]);
  });
});
