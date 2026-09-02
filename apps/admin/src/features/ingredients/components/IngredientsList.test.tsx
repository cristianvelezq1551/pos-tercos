// @vitest-environment jsdom
import type { Ingredient } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IngredientsList } from './IngredientsList';

/**
 * Dos cosas que se pedían mirando la lista en producción: saber de un vistazo
 * si un insumo frena la venta, y poder buscarlo sin recorrer 80 filas.
 */

const base: Omit<Ingredient, 'id' | 'name' | 'blocksAvailability'> = {
  unitPurchase: 'paquete',
  unitRecipe: 'unidad',
  conversionFactor: 12,
  thresholdMin: 20,
  portionSize: null,
  lastUnitCost: null,
  lastUnitCostDate: null,
  showInKitchen: true,
  isActive: true,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

const INSUMOS: Ingredient[] = [
  { ...base, id: 'a', name: 'Pan brioche', blocksAvailability: true },
  { ...base, id: 'b', name: 'Servilletas', blocksAvailability: false },
  { ...base, id: 'c', name: 'Piña en almíbar', blocksAvailability: true },
];

function fila(nombre: string): HTMLElement {
  return screen.getByText(nombre).closest('tr') as HTMLElement;
}

describe('columna "Frena venta"', () => {
  it('dice Sí en el insumo que bloquea y No en el consumible', () => {
    render(<IngredientsList ingredients={INSUMOS} />);

    expect(screen.getByRole('columnheader', { name: 'Frena venta' })).toBeDefined();
    expect(fila('Pan brioche').textContent).toContain('Sí');
    expect(fila('Servilletas').textContent).toContain('No');
  });
});

describe('buscador de insumos', () => {
  const buscar = (texto: string) => {
    fireEvent.change(screen.getByLabelText('Buscar insumo por nombre'), {
      target: { value: texto },
    });
  };

  it('deja solo lo que coincide', () => {
    render(<IngredientsList ingredients={INSUMOS} />);
    buscar('pan');
    expect(screen.getByText('Pan brioche')).toBeDefined();
    expect(screen.queryByText('Servilletas')).toBeNull();
  });

  it('encuentra sin escribir la tilde', () => {
    render(<IngredientsList ingredients={INSUMOS} />);
    buscar('pina');
    expect(screen.getByText('Piña en almíbar')).toBeDefined();
  });

  // Sin esto la tabla mostraría "Aún no tienes insumos cargados" con 3 insumos
  // cargados: el vacío de una búsqueda no es el vacío de una lista sin datos.
  it('sin coincidencias NO dice que la lista está vacía', () => {
    render(<IngredientsList ingredients={INSUMOS} />);
    buscar('zanahoria');
    expect(screen.getByText('Ningún insumo coincide')).toBeDefined();
    expect(screen.queryByText('Aún no tienes insumos cargados')).toBeNull();
  });

  it('cuenta cuántos quedan a la vista', () => {
    render(<IngredientsList ingredients={INSUMOS} />);
    expect(screen.getByText('3 insumos')).toBeDefined();
    buscar('pan');
    expect(screen.getByText('1 de 3 insumos')).toBeDefined();
  });
});
