import { describe, expect, it } from 'vitest';
import {
  colombianHolidays,
  isColombianHolidayYmd,
} from './colombia-holidays';

/**
 * Calendarios completos contrastados contra el oficial. Son la red que atrapa
 * cualquier retoque a las reglas de traslado.
 */
describe('colombianHolidays — calendarios completos', () => {
  it('2025 tiene 17 días: San Pedro cayó sobre Sagrado Corazón', () => {
    // El 29 de junio de 2025 fue domingo → San Pedro se corrió al lunes 30, que
    // ya era Sagrado Corazón. Dos reglas, un solo día libre. No es un bug.
    expect([...colombianHolidays(2025)].sort()).toEqual([
      '2025-01-01', // Año Nuevo (miércoles)
      '2025-01-06', // Reyes (ya era lunes)
      '2025-03-24', // San José (19 mar miércoles → lunes 24)
      '2025-04-17', // Jueves Santo
      '2025-04-18', // Viernes Santo
      '2025-05-01', // Trabajo (jueves, fijo)
      '2025-06-02', // Ascensión
      '2025-06-23', // Corpus Christi
      '2025-06-30', // Sagrado Corazón + San Pedro
      '2025-07-20', // Independencia (domingo, fijo)
      '2025-08-07', // Boyacá
      '2025-08-18', // Asunción (15 ago viernes → lunes 18)
      '2025-10-13', // Raza (12 oct domingo → lunes 13)
      '2025-11-03', // Todos los Santos (1 nov sábado → lunes 3)
      '2025-11-17', // Cartagena (11 nov martes → lunes 17)
      '2025-12-08', // Inmaculada (lunes)
      '2025-12-25', // Navidad
    ]);
  });

  it('2026 tiene los 18 días', () => {
    expect([...colombianHolidays(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-01-12', // Reyes (6 ene martes → lunes 12)
      '2026-03-23', // San José (19 mar jueves → lunes 23)
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01',
      '2026-05-18', // Ascensión
      '2026-06-08', // Corpus Christi
      '2026-06-15', // Sagrado Corazón
      '2026-06-29', // San Pedro (ya era lunes)
      '2026-07-20', // Independencia (lunes)
      '2026-08-07',
      '2026-08-17', // Asunción (15 ago sábado → lunes 17)
      '2026-10-12', // Raza (lunes)
      '2026-11-02', // Todos los Santos (1 nov domingo → lunes 2)
      '2026-11-16', // Cartagena (11 nov miércoles → lunes 16)
      '2026-12-08',
      '2026-12-25',
    ]);
  });

  it('nunca hay menos de 17 ni más de 18 en una década', () => {
    for (let y = 2024; y <= 2035; y++) {
      const count = colombianHolidays(y).size;
      expect(count).toBeGreaterThanOrEqual(17);
      expect(count).toBeLessThanOrEqual(18);
    }
  });

  it('los Emiliani siempre terminan en lunes', () => {
    for (const date of ['2027-01-11', '2027-03-22', '2027-07-05', '2027-08-16']) {
      expect(colombianHolidays(2027).has(date)).toBe(true);
      expect(new Date(`${date}T12:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it('Jueves y Viernes Santo NO se corren al lunes', () => {
    const h = colombianHolidays(2026); // Pascua = 5 abr
    expect(h.has('2026-04-02')).toBe(true);
    expect(h.has('2026-04-03')).toBe(true);
    expect(h.has('2026-04-06')).toBe(false); // el lunes siguiente es normal
  });
});

describe('isColombianHolidayYmd', () => {
  it('reconoce festivos y descarta días normales', () => {
    expect(isColombianHolidayYmd('2026-12-25')).toBe(true);
    expect(isColombianHolidayYmd('2026-07-20')).toBe(true);
    expect(isColombianHolidayYmd('2026-07-13')).toBe(false);
  });

  it('el caché no altera el resultado', () => {
    expect(isColombianHolidayYmd('2027-01-11')).toBe(true);
    expect(isColombianHolidayYmd('2027-01-11')).toBe(true);
    expect(isColombianHolidayYmd('2027-01-12')).toBe(false);
  });

  it('no explota con basura', () => {
    expect(isColombianHolidayYmd('')).toBe(false);
    expect(isColombianHolidayYmd('nope')).toBe(false);
  });
});
