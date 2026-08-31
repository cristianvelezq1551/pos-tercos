import { describe, expect, it } from 'vitest';
import { formatShiftWindow } from './format-shift-window';

/**
 * Instante REAL de una hora de pared de Bogotá (UTC-5 todo el año, sin horario
 * de verano). Antes esto usaba `new Date(y, m, d, …)`, que arma el instante con
 * el reloj del runtime: los casos pasaban solo si la máquina estaba en Bogotá y
 * en un servidor en UTC afirmaban una hora distinta a la que el dueño ve.
 */
function enBogota(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(Date.UTC(y, m - 1, d, h + 5, min)).toISOString();
}

describe('formatShiftWindow', () => {
  it('turno del mismo día no repite la fecha', () => {
    expect(formatShiftWindow(enBogota(2026, 7, 27, 18, 47), enBogota(2026, 7, 27, 19, 56))).toBe(
      '27 jul · 6:47 pm → 7:56 pm',
    );
  });

  it('turno que cruzó de día muestra ambas fechas', () => {
    expect(formatShiftWindow(enBogota(2026, 7, 25, 13, 49), enBogota(2026, 7, 27, 18, 47))).toBe(
      '25 jul 1:49 pm → 27 jul 6:47 pm',
    );
  });

  it('caja abierta lo dice en vez de inventar cierre', () => {
    expect(formatShiftWindow(enBogota(2026, 7, 27, 0, 5), null)).toBe('27 jul · 12:05 am → sin cerrar');
  });
});

/**
 * El bug que reportó el dueño probando en producción: abrió la caja a las
 * 4:35 pm y la tabla de Turnos decía "9:35 pm".
 *
 * La causa: esta tabla se arma en el SERVIDOR y Vercel corre en UTC, y este
 * formateador lee la hora con `getHours()`/`getDate()` a mano — así que el
 * barrido que fijó la zona en los formateadores de `Intl` no lo alcanzó.
 */
describe('la hora es la del LOCAL, no la del servidor', () => {
  // 21:35 UTC del 30 = 4:35 pm en Bogotá, el caso exacto reportado.
  const APERTURA = '2026-08-30T21:35:43.830Z';

  it('una caja abierta a las 4:35 pm NO se muestra como 9:35 pm', () => {
    expect(formatShiftWindow(APERTURA, null)).toBe('30 ago · 4:35 pm → sin cerrar');
  });

  it('la madrugada UTC no adelanta el día', () => {
    // 04:20 UTC del 30 es todavía el 29 a las 11:20 pm en Bogotá.
    expect(formatShiftWindow('2026-08-30T04:20:43.134Z', null)).toBe(
      '29 ago · 11:20 pm → sin cerrar',
    );
  });

  it('coincide con lo que dice el reloj de Bogotá para ese mismo instante', () => {
    // Lo que prueba: que este formateador hecho a mano habla la hora del local.
    // Que la conversión funcione en un runtime en UTC está probado aparte, en
    // el test de `businessWallClock` (que sí corre en un proceso con TZ=UTC).
    const enBogota = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(new Date(APERTURA))
      .replace(/\s|\./g, '')
      .toLowerCase();
    expect(enBogota).toBe('4:35pm');
    expect(formatShiftWindow(APERTURA, null).replace(/\s|\./g, '')).toContain(enBogota);
  });
});
