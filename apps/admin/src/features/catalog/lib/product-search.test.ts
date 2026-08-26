import { describe, expect, it } from 'vitest';
import type { Product } from '@pos-tercos/types';
import { filterProductsByQuery, matchesProductQuery, normalizeForSearch } from './product-search';

function product(name: string, category: string | null = null): Product {
  return { id: name, name, category } as unknown as Product;
}

const CATALOGO = [
  product('Hamburguesa Sencilla', 'Hamburguesas'),
  product('Piña Colada', 'Bebidas'),
  product('Coca-Cola 400ml', 'Bebidas'),
  product('Coca-Cola 1.5L', 'Bebidas'),
  product('Sopa de pollo', 'Sopas'),
  product('Pollo Broaster', 'Pollos'),
  product('Papas sin categoría', null),
];

const nombres = (ps: Product[]) => ps.map((p) => p.name);

describe('normalizeForSearch', () => {
  it('quita tildes y mayúsculas', () => {
    expect(normalizeForSearch('  Piña   COLADA ')).toBe('pina colada');
  });
});

describe('matchesProductQuery', () => {
  it('encuentra sin tildes', () => {
    expect(matchesProductQuery(product('Piña Colada'), 'pina')).toBe(true);
  });

  it('encuentra por categoría', () => {
    expect(matchesProductQuery(product('Coca-Cola', 'Bebidas'), 'bebida')).toBe(true);
  });

  it('ignora los separadores del nombre', () => {
    expect(matchesProductQuery(product('Coca-Cola 400ml'), 'cocacola')).toBe(true);
  });

  it('exige TODOS los términos', () => {
    const p = product('Coca-Cola 400ml', 'Bebidas');
    expect(matchesProductQuery(p, 'coca 400')).toBe(true);
    expect(matchesProductQuery(p, 'coca 500')).toBe(false);
  });

  it('un producto sin categoría no revienta', () => {
    expect(matchesProductQuery(product('Papas', null), 'papas')).toBe(true);
  });
});

describe('filterProductsByQuery', () => {
  it('sin texto devuelve el catálogo intacto', () => {
    expect(filterProductsByQuery(CATALOGO, '   ')).toBe(CATALOGO);
  });

  it('busca en TODO el menú, no en una categoría', () => {
    expect(nombres(filterProductsByQuery(CATALOGO, 'coca'))).toEqual([
      'Coca-Cola 1.5L',
      'Coca-Cola 400ml',
    ]);
  });

  it('prioriza lo que empieza por lo tecleado', () => {
    expect(nombres(filterProductsByQuery(CATALOGO, 'pollo'))).toEqual([
      'Pollo Broaster',
      'Sopa de pollo',
    ]);
  });

  it('sin coincidencias devuelve vacío', () => {
    expect(filterProductsByQuery(CATALOGO, 'sushi')).toEqual([]);
  });
});
