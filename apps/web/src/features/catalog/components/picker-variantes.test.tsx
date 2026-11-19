// @vitest-environment jsdom
import type { PublicMenuProduct } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductPickerModal } from './ProductPickerModal';

const talla = (id: string, name: string, sortOrder: number) => ({
  id,
  productId: '11111111-1111-4111-8111-111111111111',
  name,
  priceModifier: 0,
  sortOrder,
});

const producto: PublicMenuProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Perros TERCOS',
  description: null,
  basePrice: 26000,
  category: 'Perros',
  imageUrl: null,
  modifiersEnabled: false,
  isCombo: false,
  comboPrice: null,
  sizes: [
    talla('s1', 'Dos Perro sandwich', 0),
    talla('s2', 'Dos Perro burger', 1),
    talla('s3', 'Un Perro sandwich y un Perro burger', 2),
  ],
  modifiers: [],
  choiceGroups: [],
};

function abrir(agotadas?: ReadonlySet<string>) {
  const onConfirm = vi.fn();
  render(<ProductPickerModal product={producto} agotadas={agotadas} open onClose={vi.fn()} onConfirm={onConfirm} />);
  return { onConfirm, agregar: screen.getByRole('button', { name: /Agregar al carrito/ }) as HTMLButtonElement };
}

describe('Web · elegir la opción de un producto', () => {
  it('abre sin ninguna opción marcada y sin dejar agregar', () => {
    const { agregar } = abrir();
    expect(screen.getByText('Elige una opción')).toBeTruthy();
    expect(screen.queryByText('Tamaño')).toBeNull();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.checked)).toHaveLength(0);
    expect(agregar.disabled).toBe(true);
  });

  it('al elegir una opción se puede agregar y va con ESA opción', () => {
    const { agregar, onConfirm } = abrir();
    fireEvent.click(screen.getByRole('radio', { name: /Un Perro sandwich y un Perro burger/ }));
    expect(agregar.disabled).toBe(false);
    fireEvent.click(agregar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].size.id).toBe('s3');
  });

  it('una opción agotada no se marca sola ni se puede elegir', () => {
    abrir(new Set(['s1']));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.filter((r) => r.checked)).toHaveLength(0);
    expect(radios[0].disabled).toBe(true);
  });
});
