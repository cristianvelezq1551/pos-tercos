// @vitest-environment jsdom
import type { Product } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductsList } from './ProductsList';

const base: Omit<Product, 'id' | 'name' | 'category'> = {
  description: null,
  preparationSteps: [],
  basePrice: 12000,
  imageUrl: null,
  prepImages: [],
  emoji: null,
  modifiersEnabled: false,
  isCombo: false,
  comboPrice: null,
  isActive: true,
  soldOut: false,
  forceAvailable: false,
  directResale: false,
  unitPurchase: null,
  unitStock: null,
  conversionFactor: null,
  thresholdMin: 0,
  lastUnitCost: null,
  lastUnitCostDate: null,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

const PRODUCTOS: Product[] = [
  { ...base, id: 'a', name: 'Hamburguesa clásica', category: 'Hamburguesas' },
  { ...base, id: 'b', name: 'Limonada', category: 'Bebidas' },
];

describe('buscador de productos', () => {
  const buscar = (texto: string) =>
    fireEvent.change(screen.getByLabelText('Buscar producto por nombre o categoría'), {
      target: { value: texto },
    });

  it('busca por nombre', () => {
    render(<ProductsList products={PRODUCTOS} />);
    buscar('limon');
    expect(screen.getByText('Limonada')).toBeDefined();
    expect(screen.queryByText('Hamburguesa clásica')).toBeNull();
  });

  // La carta se piensa por categorías: "bebidas" tiene que traer las bebidas.
  it('busca también por categoría', () => {
    render(<ProductsList products={PRODUCTOS} />);
    buscar('bebidas');
    expect(screen.getByText('Limonada')).toBeDefined();
    expect(screen.queryByText('Hamburguesa clásica')).toBeNull();
  });
});
