// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CartLine } from '../lib/cart-types';
import { CartLineRow } from './CartLineRow';

/**
 * En la pantalla del mostrador no entraban más de tres productos: cada línea
 * ocupaba cinco renglones, y uno de ellos era un campo de nota SIEMPRE visible
 * de 44 px que casi nunca se usa. Estos casos fijan las dos cosas que dan el
 * espacio: la nota no ocupa lugar hasta que hace falta, y "otro más" crea una
 * línea aparte en vez de subir la cantidad.
 */
const linea = (over: Partial<CartLine> = {}): CartLine =>
  ({
    lineId: 'l1',
    productId: 'p1',
    productName: 'Hamburguesa',
    size: null,
    modifiers: [],
    quantity: 1,
    unitPrice: 18000,
    isCombo: false,
    ...over,
  }) as CartLine;

const props = {
  lineSubtotal: 18000,
  lineDiscount: 0,
  lineTotal: 18000,
  hasPromo: false,
  onQty: vi.fn(),
  onDuplicate: vi.fn(),
  onRemove: vi.fn(),
  onNotes: vi.fn(),
};

describe('línea del carrito', () => {
  it('sin nota, el campo de nota NO ocupa espacio', () => {
    render(<CartLineRow line={linea()} {...props} />);
    expect(screen.queryByPlaceholderText(/Nota para cocina/)).toBeNull();
  });

  it('con nota escrita, se muestra sola (no hay que ir a buscarla)', () => {
    render(<CartLineRow line={linea({ notes: 'sin cebolla' })} {...props} />);
    const campo = screen.getByPlaceholderText(/Nota para cocina/) as HTMLInputElement;
    expect(campo.value).toBe('sin cebolla');
  });

  it('el botón de nota la abre cuando se necesita', () => {
    render(<CartLineRow line={linea()} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Escribir una nota/ }));
    expect(screen.getByPlaceholderText(/Nota para cocina/)).toBeDefined();
  });

  it('"otro más" crea línea aparte, NO sube la cantidad', () => {
    const onDuplicate = vi.fn();
    const onQty = vi.fn();
    render(<CartLineRow line={linea()} {...props} onDuplicate={onDuplicate} onQty={onQty} />);
    fireEvent.click(screen.getByRole('button', { name: /en línea aparte/ }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onQty).not.toHaveBeenCalled();
  });

  it('el precio unitario va junto a las opciones, no en su propio renglón', () => {
    render(<CartLineRow line={linea({ size: { id: 's', name: 'Grande', priceModifier: 0 } })} {...props} />);
    expect(screen.getByText(/Grande · \$18\.000 c\/u/)).toBeDefined();
  });
});
