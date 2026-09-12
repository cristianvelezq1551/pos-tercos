// @vitest-environment jsdom
import type { CashierAnomalies } from '@pos-tercos/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnomaliesView } from './AnomaliesView';

let n = 0;
const uuid = () => `0000000${(++n).toString(16).padStart(1, '0')}-0000-4000-8000-000000000000`;

const turno = (
  o: Partial<CashierAnomalies['shifts'][number]> = {},
): CashierAnomalies['shifts'][number] => ({
  shiftId: uuid(),
  openedAt: '2026-09-08T02:11:00.000Z',
  closedAt: '2026-09-08T10:00:00.000Z',
  difference: 0,
  digitalDifference: 0,
  totalDifference: 0,
  voidCount: 0,
  noSaleCount: 0,
  flags: [],
  ...o,
});

const cajero = (o: Partial<CashierAnomalies> = {}): CashierAnomalies => ({
  cashierId: uuid(),
  cashierName: 'Rony',
  totalShifts: 8,
  baseline: {
    sampleSize: 8,
    arqueados: 8,
    avgDiff: 35143,
    stdDiff: 45477,
    avgVoids: 0,
    stdVoids: 0,
    avgNoSale: 0,
    stdNoSale: 0,
    typicalDiff: 500,
    thresholdDiff: 5000,
    typicalVoids: 0,
    thresholdVoids: 1,
    typicalNoSale: 0,
    thresholdNoSale: 1,
  },
  shifts: [turno()],
  ...o,
});

describe('AnomaliesView', () => {
  it('cuenta TODOS los turnos marcados, no solo el último', () => {
    render(
      <AnomaliesView
        data={[
          cajero({
            shifts: [
              turno(),
              turno({ totalDifference: 228000, difference: 140000, digitalDifference: 88000, flags: ['diff_high'] }),
              turno(),
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('1 de 3 turnos se salen de lo normal')).toBeTruthy();
  });

  it('sin nada marcado no promete que solo miró el último', () => {
    render(<AnomaliesView data={[cajero({ shifts: [turno(), turno(), turno()] })]} />);
    expect(screen.getByText('Nada fuera de norma en los últimos 3 turnos')).toBeTruthy();
  });

  it('muestra el umbral a partir del cual se marca, no la σ', () => {
    render(<AnomaliesView data={[cajero()]} />);
    expect(screen.getByText(/se marca por encima de \$\s?5.000/)).toBeTruthy();
  });

  it('el cajón corto con la cuenta sobrada se ve como total en cero', () => {
    render(
      <AnomaliesView
        data={[
          cajero({
            shifts: [turno({ difference: -43000, digitalDifference: 43000, totalDifference: 0 })],
          }),
        ]}
      />,
    );
    expect(screen.getByText('-$ 43.000')).toBeTruthy();
    expect(screen.getByText('+$ 43.000')).toBeTruthy();
    expect(screen.getByText(/es un domicilio que el cliente transfirió/)).toBeTruthy();
  });

  it('un turno sin arquear lo dice, no lo muestra en cero', () => {
    render(
      <AnomaliesView
        data={[cajero({ shifts: [turno({ digitalDifference: null, totalDifference: null })] })]}
      />,
    );
    expect(screen.getAllByText('sin arquear').length).toBeGreaterThan(0);
  });

  it('sin historial suficiente no inventa un normal', () => {
    render(<AnomaliesView data={[cajero({ baseline: null, totalShifts: 2 })]} />);
    expect(screen.getByText(/Sin historial suficiente/)).toBeTruthy();
  });

  it('sin 5 turnos arqueados no promete un descuadre habitual', () => {
    const base = { ...cajero().baseline!, typicalDiff: null, thresholdDiff: null, arqueados: 3 };
    render(<AnomaliesView data={[cajero({ baseline: base, shifts: [turno(), turno()] })]} />);
    expect(screen.getByText(/no se marca ningún descuadre/)).toBeTruthy();
  });

  it('un descuadre parejo no es anomalía, pero la pantalla no lo tapa', () => {
    // Cinco turnos con el mismo descuadre: para esa persona es su norma, así
    // que no se marca. Si la pantalla se quedara ahí, se leería "todo bien".
    const shifts = Array.from({ length: 5 }, () =>
      turno({ difference: 50000, digitalDifference: 0, totalDifference: 50000 }),
    );
    render(
      <AnomaliesView
        data={[
          cajero({
            shifts,
            baseline: { ...cajero().baseline!, typicalDiff: 50000, thresholdDiff: 50000, arqueados: 5 },
          }),
        ]}
      />,
    );
    expect(screen.getByText('Nada fuera de norma en los últimos 5 turnos')).toBeTruthy();
    expect(screen.getByText(/5 de 5 turnos cerraron con un descuadre/)).toBeTruthy();
  });

  it('si el API todavía no manda el total, no dibuja columnas que no puede llenar', () => {
    // Ventana de despliegue: el admin es nuevo y el API viejo. Los campos vienen
    // AUSENTES, que no es lo mismo que "sin arquear".
    const viejo = turno({ difference: -43000 });
    delete (viejo as { digitalDifference?: unknown }).digitalDifference;
    delete (viejo as { totalDifference?: unknown }).totalDifference;
    render(<AnomaliesView data={[cajero({ shifts: [viejo] })]} />);
    // La tabla dibuja el encabezado dos veces: la columna en escritorio y la
    // etiqueta de la tarjeta en teléfono.
    expect(screen.queryAllByText('Cuenta')).toHaveLength(0);
    expect(screen.queryAllByText('Total')).toHaveLength(0);
    expect(screen.queryAllByText('sin arquear')).toHaveLength(0);
    expect(screen.getAllByText('Descuadre').length).toBeGreaterThan(0);
  });
});
