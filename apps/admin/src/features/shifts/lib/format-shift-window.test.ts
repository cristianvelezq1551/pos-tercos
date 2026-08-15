import { describe, expect, it } from 'vitest';
import { formatShiftWindow } from './format-shift-window';

/** Se arma con hora local: los ISO de abajo asumen TZ del entorno de test. */
function local(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

describe('formatShiftWindow', () => {
  it('turno del mismo día no repite la fecha', () => {
    expect(formatShiftWindow(local(2026, 7, 27, 18, 47), local(2026, 7, 27, 19, 56))).toBe(
      '27 jul · 6:47 pm → 7:56 pm',
    );
  });

  it('turno que cruzó de día muestra ambas fechas', () => {
    expect(formatShiftWindow(local(2026, 7, 25, 13, 49), local(2026, 7, 27, 18, 47))).toBe(
      '25 jul 1:49 pm → 27 jul 6:47 pm',
    );
  });

  it('caja abierta lo dice en vez de inventar cierre', () => {
    expect(formatShiftWindow(local(2026, 7, 27, 0, 5), null)).toBe('27 jul · 12:05 am → sin cerrar');
  });
});
