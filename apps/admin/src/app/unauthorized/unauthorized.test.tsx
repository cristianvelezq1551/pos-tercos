// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pos-tercos/brand', () => ({ LineArtIllustration: () => null }));

import UnauthorizedPage from './page';

/**
 * Dos negaciones distintas caían en el mismo texto. A una administradora se le
 * decía "solo los roles ADMIN_OPERATIVO y DUEÑO pueden acceder" —siendo ella
 * administradora— y se le ofrecía volver al login con la sesión intacta.
 */
const pintar = async (motivo?: string) =>
  render(await UnauthorizedPage({ searchParams: Promise.resolve(motivo ? { motivo } : {}) }));

describe('pantalla de acceso denegado', () => {
  it('a quien NO entra al admin le explica qué es esta aplicación', async () => {
    await pintar();
    expect(screen.getByText(/no entra a esta aplicación/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /login/i })).toBeDefined();
  });

  it('a quien SÍ entró pero pisó una sección del dueño no le dice que su rol es el problema', async () => {
    await pintar('seccion');
    expect(screen.getByText(/solo del dueño/i)).toBeDefined();
    // Lo que hacía daño: sugerir que la sesión está mal cuando está bien.
    expect(screen.queryByRole('link', { name: /login/i })).toBeNull();
    expect(screen.getByRole('link', { name: /inicio/i })).toBeDefined();
  });

  it('nunca muestra el nombre técnico del rol', async () => {
    for (const motivo of [undefined, 'seccion']) {
      const { unmount } = await pintar(motivo);
      expect(document.body.textContent).not.toContain('ADMIN_OPERATIVO');
      expect(document.body.textContent).not.toContain('DUENO');
      unmount();
    }
  });
});
