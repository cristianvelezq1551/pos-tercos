// @vitest-environment jsdom
import type { Subproduct } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubproductsList } from './SubproductsList';

const base: Omit<Subproduct, 'id' | 'name' | 'blocksAvailability'> = {
  yield: 20,
  unit: 'porción',
  thresholdMin: 5,
  portionSize: null,
  preparationSteps: [],
  isActive: true,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

const SUBS: Subproduct[] = [
  { ...base, id: 'a', name: 'Pollo sazonado', blocksAvailability: true },
  { ...base, id: 'b', name: 'Salsa de la casa', blocksAvailability: false },
];

const fila = (nombre: string) => screen.getByText(nombre).closest('tr') as HTMLElement;

describe('subproductos: frena la venta y buscador', () => {
  it('muestra si cada subproducto frena la venta', () => {
    render(<SubproductsList subproducts={SUBS} />);
    expect(screen.getByRole('columnheader', { name: 'Frena venta' })).toBeDefined();
    expect(fila('Pollo sazonado').textContent).toContain('Sí');
    expect(fila('Salsa de la casa').textContent).toContain('No');
  });

  it('filtra por lo tecleado', () => {
    render(<SubproductsList subproducts={SUBS} />);
    fireEvent.change(screen.getByLabelText('Buscar subproducto por nombre'), {
      target: { value: 'salsa' },
    });
    expect(screen.getByText('Salsa de la casa')).toBeDefined();
    expect(screen.queryByText('Pollo sazonado')).toBeNull();
  });
});
