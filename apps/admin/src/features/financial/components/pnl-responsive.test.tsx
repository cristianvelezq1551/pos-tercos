// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Row } from './PnlRow';

/**
 * En la pantalla del dueño (390 px) la tarjeta del P&G crecía a 502 px y los
 * montos quedaban cortados por el borde derecho: la etiqueta no podía
 * encogerse, así que el ancho mínimo de la fila era etiqueta + monto en una
 * sola línea. jsdom no mide, pero sí puede fijar el contrato que lo evita.
 */
describe('el renglón del estado financiero cabe en un celular', () => {
  it('la etiqueta puede encogerse y partirse en dos renglones', () => {
    const { container } = render(
      <Row label="Ingresos del mes (ya con descuentos)" value="$ 497.100" />,
    );
    const etiqueta = container.querySelectorAll('span')[0]!;
    expect(etiqueta.className).toContain('min-w-0');
    expect(etiqueta.className).not.toContain('whitespace-nowrap');
  });

  it('el monto NUNCA se parte ni se encoge', () => {
    const { container } = render(<Row label="Total costos fijos" value="−$ 2.612.500" strong />);
    const monto = container.querySelectorAll('span')[1]!;
    expect(monto.className).toContain('shrink-0');
    expect(monto.className).toContain('whitespace-nowrap');
  });
});
