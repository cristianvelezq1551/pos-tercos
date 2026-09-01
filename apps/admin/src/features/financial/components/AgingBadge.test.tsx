// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgingBadge, endOfPeriodMonth } from './AgingBadge';

/**
 * El badge se pinta en el SERVIDOR (Vercel, UTC) y otra vez en el navegador
 * (Bogotá). Si los dos no llegan al mismo número, React descarta el HTML del
 * servidor y grita el error #418 — que es justo lo que salía en /finanzas/pagos.
 */
describe('AgingBadge', () => {
  afterEach(() => vi.useRealTimers());

  const conReloj = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it('el ancla del período no se mueve según la zona de quien renderiza', () => {
    const d = endOfPeriodMonth(2026, 7); // julio 2026
    // Mediodía UTC cae el 31 de julio tanto en UTC como en Bogotá (UTC−5).
    expect(d.toISOString()).toBe('2026-07-31T12:00:00.000Z');
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d),
    ).toBe('2026-07-31');
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d)).toBe('2026-07-31');
  });

  it('cuenta días de calendario del local, no horas sueltas', () => {
    conReloj('2026-09-01T04:30:00Z'); // 31 de agosto, 11:30 pm en Bogotá
    render(<AgingBadge since={endOfPeriodMonth(2026, 7)} />);
    // Del 31 de julio al 31 de agosto: 31 días.
    expect(screen.getByText('hace 31 d')).toBeTruthy();
  });

  it('da el MISMO número aunque el reloj avance dentro del mismo día', () => {
    const leer = (iso: string): string => {
      conReloj(iso);
      const { container, unmount } = render(<AgingBadge since={endOfPeriodMonth(2026, 7)} />);
      const t = container.textContent ?? '';
      unmount();
      vi.useRealTimers();
      return t;
    };
    // El servidor pinta a una hora y el navegador hidrata a otra: mismo texto.
    expect(leer('2026-09-01T05:10:00Z')).toBe(leer('2026-09-01T16:45:00Z'));
  });

  it('no muestra nada cuando es reciente ni cuando no hay fecha', () => {
    conReloj('2026-09-01T04:30:00Z');
    const { container } = render(<AgingBadge since={new Date('2026-08-30T12:00:00Z')} />);
    expect(container.textContent).toBe('');
    const vacio = render(<AgingBadge since={null} />);
    expect(vacio.container.textContent).toBe('');
  });

  it('pasa a rojo después de 30 días', () => {
    conReloj('2026-09-01T04:30:00Z');
    const { container } = render(<AgingBadge since={new Date('2026-07-15T12:00:00Z')} />);
    expect(container.textContent).toContain('hace 47 d');
    expect(container.querySelector('span')?.className).toContain('destructive');
  });
});
