// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Regresión del ensayo 2026-08-20: tocar "Horarios" en la hoja "Más" no abría
 * nada. La barra desmontaba el árbol (return distinto con la hoja abierta) y
 * React remontaba MoreSheet justo cuando este acababa de abrir su modal de
 * horarios — el estado interno se perdía en silencio. La barra ahora se OCULTA
 * sin cambiar la forma del árbol, y este test muere si alguien lo vuelve a
 * cambiar.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/nosotros',
  useRouter: () => ({ push: vi.fn() }),
}));

import { MobileTabBar } from './MobileTabBar';

describe('MobileTabBar · hoja Más → Horarios', () => {
  it('abre el modal de horarios al tocar "Horarios" (el remontaje lo mataba)', () => {
    render(<MobileTabBar />);

    fireEvent.click(screen.getByRole('button', { name: /más/i }));
    expect(screen.getByRole('dialog', { name: 'Más opciones' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /horarios/i }));

    // El modal de horarios queda visible (y la hoja "Más" se cerró).
    expect(screen.getByRole('heading', { name: 'Horarios' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Más opciones' })).toBeNull();
  });
});
