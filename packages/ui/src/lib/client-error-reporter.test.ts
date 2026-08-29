import { describe, expect, it } from 'vitest';
import { crearFiltroDeErrores } from './client-error-reporter';

describe('crearFiltroDeErrores', () => {
  it('deja pasar un error normal', () => {
    const f = crearFiltroDeErrores();
    expect(f.permite('Cannot read properties of undefined', 1_000)).toBe(true);
  });

  /** Un error dentro de un render se dispara cientos de veces por segundo. */
  it('no repite el mismo mensaje dentro de la ventana', () => {
    const f = crearFiltroDeErrores();
    expect(f.permite('boom', 1_000)).toBe(true);
    expect(f.permite('boom', 1_500)).toBe(false);
    expect(f.permite('boom', 60_000)).toBe(false);
  });

  it('acota cuántos distintos entran por ventana', () => {
    const f = crearFiltroDeErrores({ maxPorVentana: 2, ventanaMs: 60_000 });
    expect(f.permite('a', 0)).toBe(true);
    expect(f.permite('b', 0)).toBe(true);
    expect(f.permite('c', 0)).toBe(false);
  });

  it('al pasar la ventana vuelve a admitir', () => {
    const f = crearFiltroDeErrores({ maxPorVentana: 1, ventanaMs: 1_000 });
    expect(f.permite('a', 0)).toBe(true);
    expect(f.permite('b', 500)).toBe(false);
    expect(f.permite('b', 2_000)).toBe(true);
  });

  /**
   * `ResizeObserver loop` es un aviso benigno de Chrome y `Script error.` es
   * lo que se ve cuando revienta un script de otro origen (una extensión):
   * llega sin archivo ni línea, no se puede investigar y casi nunca es nuestro.
   */
  it('descarta el ruido del navegador', () => {
    const f = crearFiltroDeErrores();
    expect(f.permite('ResizeObserver loop completed with undelivered notifications.', 0)).toBe(
      false,
    );
    expect(f.permite('Script error.', 0)).toBe(false);
    expect(f.permite('Script error', 0)).toBe(false);
  });

  it('el ruido no gasta cupo de la ventana', () => {
    const f = crearFiltroDeErrores({ maxPorVentana: 1, ventanaMs: 60_000 });
    expect(f.permite('Script error.', 0)).toBe(false);
    expect(f.permite('un error de verdad', 0)).toBe(true);
  });
});
