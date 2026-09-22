// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PocketBadge } from './PocketBadge';

/**
 * El bolsillo se muestra SOLO con un icono, así que lo único que lo hace
 * legible para quien no ve la pantalla —y para quien pasa el mouse— es el
 * nombre accesible. Si alguien lo quita, el dato se vuelve invisible sin que
 * nada falle.
 */
describe('PocketBadge', () => {
  it('un pago en efectivo se anuncia con su monto', () => {
    render(<PocketBadge pago={{ cashAmount: 150_000, bankAmount: 0 }} />);
    expect(screen.getByLabelText(/Salió en efectivo/)).toBeTruthy();
  });

  it('un pago por cuenta se anuncia con su monto', () => {
    render(<PocketBadge pago={{ cashAmount: 0, bankAmount: 200_000 }} />);
    expect(screen.getByLabelText(/Salió de la cuenta/)).toBeTruthy();
  });

  it('el mixto dice LAS DOS partes: es el dato que el icono no puede mostrar', () => {
    render(<PocketBadge pago={{ cashAmount: 80_000, bankAmount: 120_000 }} />);
    const el = screen.getByLabelText(/Mixto/);
    expect(el.getAttribute('aria-label')).toContain('80.000');
    expect(el.getAttribute('aria-label')).toContain('120.000');
  });

  it('sin reparto no se pinta nada, para no inventar un bolsillo', () => {
    const { container } = render(<PocketBadge pago={{ cashAmount: 0, bankAmount: 0 }} />);
    expect(container.textContent).toBe('');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('sin reparto y con mostrarSinDato lo dice explícitamente', () => {
    render(<PocketBadge pago={{ cashAmount: 0, bankAmount: 0 }} mostrarSinDato />);
    expect(screen.getByLabelText(/No quedó registrado/)).toBeTruthy();
  });

  it('en pantallas de detalle acompaña el icono con la palabra', () => {
    render(<PocketBadge pago={{ cashAmount: 0, bankAmount: 5_000 }} conPalabra />);
    expect(screen.getByText('Cuenta')).toBeTruthy();
  });

  it('en las listas NO escribe la palabra (ese era el ruido)', () => {
    render(<PocketBadge pago={{ cashAmount: 0, bankAmount: 5_000 }} />);
    expect(screen.queryByText('Cuenta')).toBeNull();
  });
});
