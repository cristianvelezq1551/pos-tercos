/**
 * El componente del combo pide su VARIANTE cuando el plato la tiene
 * (PLAN-COMBO-CON-VARIANTE.md, entrega 2). Lo que se prueba es lo que ve y toca
 * el dueño: el selector aparece solo para un plato con variantes, no viene con
 * nada elegido (elegir es obligatorio), y la suma de los componentes usa el
 * precio de ESA variante.
 */
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Product } from '@pos-tercos/types';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ProductFormComboSection } from './ProductFormComboSection';
import { newRowKey, type FormState } from './ProductFormTypes';

const producto = (p: Partial<Product> & { id: string; name: string }): Product =>
  ({ basePrice: 0, isActive: true, isCombo: false, sizes: [], comboComponents: [], ...p }) as Product;

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

function Host({ filas, comboPrice = '' }: { filas: FormState['comboComponents']; comboPrice?: string }) {
  const [form, setForm] = useState<FormState>(
    () => ({ kind: 'combo', comboPrice, comboComponents: filas, choiceGroups: [] }) as unknown as FormState,
  );
  return (
    <>
      <ProductFormComboSection form={form} setForm={setForm} pending={false} candidates={[papas, sandwich]} />
      <output data-testid="estado">{JSON.stringify(form.comboComponents)}</output>
    </>
  );
}

const filaVacia = () => ({ rowKey: newRowKey(), productId: '', sizeId: '', quantity: '1' });
const estado = () =>
  JSON.parse(screen.getByTestId('estado').textContent ?? '[]') as Array<{ productId: string; sizeId: string }>;

describe('ProductFormComboSection — variante del componente', () => {
  it('al elegir un plato con variantes aparece el selector, obligatorio y SIN nada elegido', () => {
    render(<Host filas={[filaVacia()]} />);
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'papas' } });

    const variante = screen.getByLabelText('Variante de Papas TERCOS') as HTMLSelectElement;
    expect(variante.required).toBe(true);
    expect(variante.value).toBe('');
    const opciones = within(variante).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Pollo y Miel ahumada'),
        expect.stringContaining('Carne smash doble'),
      ]),
    );
  });

  it('elegir la variante la guarda en la fila del componente', () => {
    render(<Host filas={[filaVacia()]} />);
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'papas' } });
    fireEvent.change(screen.getByLabelText('Variante de Papas TERCOS'), { target: { value: 's-pollo' } });
    expect(estado()[0]).toMatchObject({ productId: 'papas', sizeId: 's-pollo' });
  });

  it('un plato SIN variantes no muestra selector de variante', () => {
    render(<Host filas={[filaVacia()]} />);
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'sandwich' } });
    expect(screen.queryByLabelText(/^Variante de/)).toBeNull();
  });

  it('cambiar de plato BORRA la variante elegida: era de otro plato', () => {
    render(<Host filas={[{ rowKey: newRowKey(), productId: 'papas', sizeId: 's-carne', quantity: '1' }]} />);
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'sandwich' } });
    expect(estado()[0]).toMatchObject({ productId: 'sandwich', sizeId: '' });
  });

  it('la suma de componentes usa el precio de la variante elegida', () => {
    render(
      <Host filas={[{ rowKey: newRowKey(), productId: 'papas', sizeId: 's-carne', quantity: '2' }]} comboPrice="50000" />,
    );
    // 2 × (25.000 + 3.000) = 56.000 → ahorro 6.000.
    expect(screen.getByText(/Suma de componentes/).textContent).toMatch(/56\.000/);
    expect(screen.getByText(/Ahorro/).parentElement?.textContent).toMatch(/6\.000/);
  });

  it('un componente con variantes que quedó SIN elegir (el plato las ganó después) lo dice', () => {
    render(<Host filas={[{ rowKey: newRowKey(), productId: 'papas', sizeId: '', quantity: '1' }]} />);
    expect(screen.getByText(/tiene variantes: elige cuál lleva el combo/i)).toBeTruthy();
  });
});
