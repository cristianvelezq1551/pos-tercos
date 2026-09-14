// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonthCutoffCard } from './MonthCutoffCard';

// El editor (hoy no montado) usa el router de Next. Se mockea para que, si
// alguien vuelve a encender el interruptor, fallen SOLO los casos que de
// verdad cambian de comportamiento y no estos por falta de contexto.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * El mes del negocio quedó FIJO (decisión del dueño 2026-09-14): la tarjeta
 * dice de qué día a qué día va el período y nada más.
 *
 * Esconder el campo no alcanzaba por sí solo —el API también rechaza el
 * cambio— pero sí es la mitad que importa acá: mover ese día recalcula todo el
 * estado financiero de golpe, y un clic por curiosidad reescribe el histórico
 * con el que se toman decisiones.
 */
describe('MonthCutoffCard con el mes del negocio fijo', () => {
  it('muestra la ventana del período', () => {
    render(<MonthCutoffCard monthStartDay={1} periodStart="2026-09-01" periodEnd="2026-09-30" />);
    const caja = screen.getByText(/Periodo mostrado/).textContent ?? '';
    expect(caja).toMatch(/sept/i);
    expect(caja).toContain('2026');
  });

  it('NO ofrece cambiar el día en que empieza el mes', () => {
    const { container } = render(
      <MonthCutoffCard monthStartDay={1} periodStart="2026-09-01" periodEnd="2026-09-30" />,
    );
    expect(screen.queryByText(/Empieza el día/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Guardar/i })).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('sigue explicando que la ventana no es el mes calendario', () => {
    render(<MonthCutoffCard monthStartDay={1} periodStart="2026-09-01" periodEnd="2026-09-30" />);
    expect(screen.getByText(/no el mes calendario/)).toBeTruthy();
  });
});
