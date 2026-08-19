import { describe, expect, it } from 'vitest';
import { formatDayRanges, formatNextOpen, formatTime, todayKey } from './hours-text';

describe('formatTime', () => {
  it('pasa 24 h a 12 h sin puntos en am/pm', () => {
    expect(formatTime('17:00')).toBe('5:00 pm');
    expect(formatTime('00:30')).toBe('12:30 am');
    expect(formatTime('12:00')).toBe('12:00 pm');
    expect(formatTime('09:05')).toBe('9:05 am');
    expect(formatTime('23:59')).toBe('11:59 pm');
  });
});

describe('formatDayRanges', () => {
  it('sin rangos = cerrado', () => {
    expect(formatDayRanges([])).toBe('Cerrado');
  });

  it('junta varias franjas', () => {
    expect(
      formatDayRanges([
        { start: '12:00', end: '15:00' },
        { start: '18:00', end: '23:00' },
      ]),
    ).toBe('12:00 pm – 3:00 pm · 6:00 pm – 11:00 pm');
  });
});

describe('formatNextOpen', () => {
  const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

  it('no termina en punto: la frase le agrega el suyo', () => {
    // Regresión: Intl en es-CO da "5:00 p. m." y salía "Abrimos hoy a las 5:00 p. m..".
    const text = formatNextOpen(at(2026, 7, 16, 17).toISOString(), at(2026, 7, 16, 12));
    expect(text).toBe('hoy a las 5:00 pm');
    expect(`Abrimos ${text}.`).toBe('Abrimos hoy a las 5:00 pm.');
  });

  it('distingue hoy, mañana y el resto de la semana', () => {
    const now = at(2026, 7, 16, 12); // jueves
    expect(formatNextOpen(at(2026, 7, 16, 17).toISOString(), now)).toBe('hoy a las 5:00 pm');
    expect(formatNextOpen(at(2026, 7, 17, 17).toISOString(), now)).toBe('mañana a las 5:00 pm');
    expect(formatNextOpen(at(2026, 7, 18, 17).toISOString(), now)).toBe('el sábado a las 5:00 pm');
  });

  it('sin próxima apertura devuelve null', () => {
    expect(formatNextOpen(null)).toBeNull();
    expect(formatNextOpen('no soy una fecha')).toBeNull();
  });
});

describe('todayKey', () => {
  it('mapea el día al índice del horario (0 = domingo)', () => {
    expect(todayKey(new Date(2026, 6, 16))).toBe('thu'); // jueves 16 jul 2026
    expect(todayKey(new Date(2026, 6, 20))).toBe('mon'); // lunes 20 jul 2026
    expect(todayKey(new Date(2026, 6, 19))).toBe('sun');
  });
});
