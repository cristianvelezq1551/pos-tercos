// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CartLine } from '../lib/cart-types';
import { CartLineRow } from './CartLineRow';

/**
 * Dos cosas que esta fila tiene que cumplir:
 *
 * 1. **Cabe.** Antes ocupaba cinco renglones y en el mostrador no entraban más
 *    de tres productos.
 * 2. **Se entiende sin que nadie la explique.** Los tres íconos sin nombre
 *    (duplicar, nota, quitar) no le decían a nadie dónde se escribe "sin
 *    cebolla" — el dueño lo reportó así. Ahora hay un botón **Editar** escrito
 *    y la nota se LEE en la fila.
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
  onSeparar: vi.fn(),
  onRemove: vi.fn(),
  onNotes: vi.fn(),
};

describe('línea del carrito', () => {
  it('sin nota, el campo de nota NO ocupa espacio', () => {
    render(<CartLineRow line={linea()} {...props} />);
    expect(screen.queryByPlaceholderText(/Nota para cocina/)).toBeNull();
  });

  it('la nota escrita SE LEE en la fila, sin abrir nada', () => {
    render(<CartLineRow line={linea({ notes: 'sin cebolla' })} {...props} />);
    expect(screen.getByText(/Nota: sin cebolla/)).toBeDefined();
  });

  it('el acceso a la nota está ESCRITO, no es un ícono a adivinar', () => {
    render(<CartLineRow line={linea()} {...props} />);
    // Con nota dice "Nota"; sin nota, "Editar". En los dos casos, una palabra.
    expect(screen.getByRole('button', { name: /Editar Hamburguesa/ }).textContent).toMatch(
      /Editar/,
    );
  });

  it('editar abre el campo de nota con su ejemplo dentro', () => {
    render(<CartLineRow line={linea()} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar Hamburguesa/ }));
    expect(screen.getByLabelText('Nota para cocina')).toBeDefined();
    expect(screen.getByPlaceholderText(/sin cebolla/)).toBeDefined();
  });

  it('con una sola unidad NO ofrece separar: no hay nada que repartir', () => {
    render(<CartLineRow line={linea()} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar Hamburguesa/ }));
    expect(screen.queryByRole('button', { name: /Separar en/ })).toBeNull();
  });

  it('con varias unidades juntas ofrece separarlas, sin agregar ninguna', () => {
    const onSeparar = vi.fn();
    const onQty = vi.fn();
    render(<CartLineRow line={linea({ quantity: 2 })} {...props} onSeparar={onSeparar} onQty={onQty} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar Hamburguesa/ }));
    fireEvent.click(screen.getByRole('button', { name: /Separar en 2 líneas/ }));
    expect(onSeparar).toHaveBeenCalledTimes(1);
    expect(onQty).not.toHaveBeenCalled();
  });

  it('quitar se puede sin abrir el editor: es la acción más repetida', () => {
    const onRemove = vi.fn();
    render(<CartLineRow line={linea()} {...props} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /Quitar Hamburguesa del pedido/ }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('el precio unitario va junto a las opciones, no en su propio renglón', () => {
    render(<CartLineRow line={linea({ size: { id: 's', name: 'Grande', priceModifier: 0 } })} {...props} />);
    expect(screen.getByText(/Grande · \$18\.000 c\/u/)).toBeDefined();
  });
});
