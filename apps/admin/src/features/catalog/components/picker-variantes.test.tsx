// @vitest-environment jsdom
import type { Product, ProductAvailability } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductPickerModal } from './ProductPickerModal';

const talla = (id: string, name: string, sortOrder: number) => ({
  id,
  productId: 'perros-1',
  name,
  priceModifier: 0,
  sortOrder,
});

const producto = {
  id: 'perros-1',
  name: 'Perros TERCOS',
  description: null,
  preparationSteps: [],
  basePrice: 26000,
  category: 'Perros',
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
  createdAt: '2026-11-19T12:00:00.000Z',
  updatedAt: '2026-11-19T12:00:00.000Z',
  sizes: [
    talla('s1', 'Dos Perro sandwich', 0),
    talla('s2', 'Dos Perro burger', 1),
    talla('s3', 'Un Perro sandwich y un Perro burger', 2),
  ],
  modifiers: [],
} as unknown as Product;

function abrir(availability?: Partial<ProductAvailability>) {
  const onConfirm = vi.fn();
  render(
    <ProductPickerModal
      product={producto}
      open
      onClose={vi.fn()}
      onConfirm={onConfirm}
      availability={
        availability
          ? ({ productId: producto.id, available: true, stock: null, reason: null, publicReason: null, variants: [], ...availability } as ProductAvailability)
          : undefined
      }
    />,
  );
  return { onConfirm, agregar: screen.getByRole('button', { name: 'Agregar al carrito' }) };
}

describe('Caja · elegir la variante de un producto', () => {
  it('abre sin ninguna opción marcada y con "Agregar al carrito" bloqueado', () => {
    const { agregar } = abrir();
    expect(screen.getByText('Elige una opción')).toBeTruthy();
    expect(screen.queryByText('Tamaño')).toBeNull();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.checked)).toHaveLength(0);
    expect((agregar as HTMLButtonElement).disabled).toBe(true);
  });

  it('al elegir una opción se habilita y confirma con ESA variante', () => {
    const { agregar, onConfirm } = abrir();
    fireEvent.click(screen.getByRole('radio', { name: /Dos Perro burger/ }));
    expect((agregar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(agregar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].size.id).toBe('s2');
  });

  it('aunque la primera opción no se pueda hacer, no se marca ninguna otra sola', () => {
    abrir({
      variants: [
        { sizeId: 's1', available: false, reason: 'Sin Coleslaw' },
        { sizeId: 's2', available: true, reason: null },
        { sizeId: 's3', available: false, reason: 'Sin Coleslaw' },
      ],
    } as Partial<ProductAvailability>);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.filter((r) => r.checked)).toHaveLength(0);
    expect(radios[0].disabled).toBe(true);
    expect(radios[1].disabled).toBe(false);
  });
});
