// @vitest-environment jsdom
import type { Product } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddProductChips } from './AddProductChips';

const producto = (i: number, name: string, extra: Partial<Product> = {}) =>
  ({ id: `p${i}`, name, category: 'Bebidas', directResale: false, ...extra }) as unknown as Product;

// 30 productos: más que el tope viejo de 24, con el que importa al final.
const catalogo = [
  ...Array.from({ length: 28 }, (_, i) => producto(i, `Producto ${i + 1}`)),
  producto(28, 'Piña colada', { directResale: true }),
  producto(29, 'Perros TERCOS', { category: 'Perros' }),
];

function pintar(opts: { kitchenStarted?: boolean; agotados?: string[] } = {}) {
  const onPick = vi.fn();
  render(
    <AddProductChips
      products={catalogo}
      kitchenStarted={opts.kitchenStarted ?? false}
      pending={false}
      isAvailable={(id) => !(opts.agotados ?? []).includes(id)}
      onPick={onPick}
    />,
  );
  return { onPick };
}
const chips = () => screen.queryAllByRole('button', { name: /^\+ / });

describe('Editar pedido · agregar producto', () => {
  it('muestra TODOS los productos, no solo los primeros 24', () => {
    pintar();
    expect(chips()).toHaveLength(30);
    expect(screen.getByRole('button', { name: '+ Perros TERCOS' })).toBeTruthy();
  });

  it('el buscador encuentra sin tildes y por categoría, y agrega el elegido', () => {
    const { onPick } = pintar();
    const buscar = screen.getByRole('searchbox', { name: 'Buscar producto para agregar al pedido' });
    fireEvent.change(buscar, { target: { value: 'pina' } });
    expect(chips().map((c) => c.textContent)).toEqual(['+ Piña colada']);
    fireEvent.change(buscar, { target: { value: 'perros' } });
    expect(chips().map((c) => c.textContent)).toEqual(['+ Perros TERCOS']);
    expect(screen.getByText(/1 de 30 productos/)).toBeTruthy();
    fireEvent.click(chips()[0]);
    expect(onPick).toHaveBeenCalledWith(catalogo[29]);
  });

  it('sin coincidencias lo dice, en vez de mostrar una lista vacía', () => {
    pintar();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar producto para agregar al pedido' }), { target: { value: 'xyz' } });
    expect(chips()).toHaveLength(0);
    expect(screen.getByText(/Ningún producto coincide con «xyz»/)).toBeTruthy();
  });

  it('con la cocina en curso solo ofrece reventa directa', () => {
    pintar({ kitchenStarted: true });
    expect(chips().map((c) => c.textContent)).toEqual(['+ Piña colada']);
  });

  it('lo agotado se ve y no se puede agregar', () => {
    pintar({ agotados: ['p29'] });
    const perros = screen.getByRole('button', { name: /Perros TERCOS/ }) as HTMLButtonElement;
    expect(perros.disabled).toBe(true);
    expect(perros.textContent).toContain('Agotado');
  });
});
