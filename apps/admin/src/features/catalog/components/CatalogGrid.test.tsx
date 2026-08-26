// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { Product } from '@pos-tercos/types';
import { describe, expect, it, vi } from 'vitest';

/**
 * La búsqueda del catálogo filtra EN CADA TECLA, no al terminar de escribir:
 * el cajero teclea "p", "i", "n", "a" y la grilla se angosta en cada paso.
 * Mutante que este test mata: meter un debounce o un botón "Buscar" — con
 * cualquiera de los dos, el conteo de tiles después de un solo `change` no
 * cambiaría.
 */

vi.mock('../../../lib/use-polling', () => ({ usePolling: () => undefined }));
vi.mock('../../sales', () => ({
  fetchActivePromotions: () => Promise.resolve([]),
  useCartStore: (selector: (s: unknown) => unknown) => selector({ addItem: () => undefined }),
}));
vi.mock('../../sales/lib/promo-preview', () => ({ getActivePromoBadge: () => null }));
vi.mock('../hooks/useAvailability', () => ({
  useAvailability: () => ({ byId: new Map(), refresh: () => Promise.resolve() }),
}));
vi.mock('../hooks/useSoldOutToggle', () => ({
  useSoldOutToggle: () => ({
    soldOutOverride: new Map(),
    forceAvailableOverride: new Map(),
    togglingId: null,
    toggleSoldOut: () => Promise.resolve(),
    toggleForceAvailable: () => Promise.resolve(),
  }),
}));

import { CatalogGrid } from './CatalogGrid';

function product(name: string, category: string): Product {
  return {
    id: name,
    name,
    category,
    basePrice: 5000,
    emoji: null,
    soldOut: false,
    forceAvailable: false,
    isCombo: false,
    modifiersEnabled: false,
    sizes: [],
    modifiers: [],
  } as unknown as Product;
}

const CATALOGO = [
  product('Piña Colada', 'Bebidas'),
  product('Pizza Margarita', 'Pizzas'),
  product('Pinchos de pollo', 'Carnes'),
  product('Hamburguesa', 'Hamburguesas'),
];

/** Los nombres visibles en la grilla, en orden. */
function tilesVisibles(): string[] {
  return CATALOGO.map((p) => p.name).filter((n) => screen.queryByText(n) !== null);
}

function abrirBusqueda() {
  fireEvent.click(screen.getByRole('button', { name: 'Buscar producto' }));
  return screen.getByRole('searchbox', { name: 'Buscar producto en todo el menú' });
}

describe('CatalogGrid · búsqueda en vivo', () => {
  it('filtra en cada tecla, sin esperar a que se termine de escribir', () => {
    render(<CatalogGrid products={CATALOGO} />);
    const input = abrirBusqueda();

    expect(tilesVisibles()).toHaveLength(4);

    fireEvent.change(input, { target: { value: 'p' } });
    expect(tilesVisibles()).toEqual(['Piña Colada', 'Pizza Margarita', 'Pinchos de pollo']);

    fireEvent.change(input, { target: { value: 'pi' } });
    expect(tilesVisibles()).toEqual(['Piña Colada', 'Pizza Margarita', 'Pinchos de pollo']);

    fireEvent.change(input, { target: { value: 'pin' } });
    expect(tilesVisibles()).toEqual(['Piña Colada', 'Pinchos de pollo']);

    fireEvent.change(input, { target: { value: 'pina' } });
    expect(tilesVisibles()).toEqual(['Piña Colada']);
  });

  it('borrar una letra devuelve los resultados de inmediato', () => {
    render(<CatalogGrid products={CATALOGO} />);
    const input = abrirBusqueda();

    fireEvent.change(input, { target: { value: 'pina' } });
    expect(tilesVisibles()).toEqual(['Piña Colada']);

    fireEvent.change(input, { target: { value: 'pi' } });
    expect(tilesVisibles()).toHaveLength(3);

    fireEvent.change(input, { target: { value: '' } });
    expect(tilesVisibles()).toHaveLength(4);
  });

  it('el contador de resultados acompaña cada tecla', () => {
    render(<CatalogGrid products={CATALOGO} />);
    const input = abrirBusqueda();

    fireEvent.change(input, { target: { value: 'p' } });
    expect(screen.getByText('3 resultados')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'pina' } });
    expect(screen.getByText('1 resultado')).toBeTruthy();
  });

  it('el campo NO pierde el foco al teclear', () => {
    render(<CatalogGrid products={CATALOGO} />);
    const input = abrirBusqueda();
    input.focus();

    fireEvent.change(input, { target: { value: 'p' } });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'pi' } });
    expect(document.activeElement).toBe(input);
  });
});
