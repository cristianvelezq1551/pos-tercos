import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BUSINESS_TIME_ZONE, businessWallClock } from './business-time';

/**
 * Vercel corre en UTC y `TZ` es un nombre de variable reservado allá: no se
 * puede cambiar el reloj del runtime. Sin esta conversión, el servidor decide
 * "qué día es hoy" y "¿la promo está en su franja?" cinco horas adelantado.
 *
 * Los casos que importan corren en un proceso APARTE con TZ=UTC. Cambiar
 * `process.env.TZ` a mitad de un proceso no es confiable —Node ya tiene la zona
 * cacheada— así que un test que lo intente puede pasar sin probar nada.
 */
const enUTC = (expresion: string): string =>
  execFileSync(process.execPath, ['-e', `process.stdout.write(String(${expresion}))`], {
    env: { ...process.env, TZ: 'UTC' },
    encoding: 'utf8',
  });

/** El helper compilado, para poder ejecutarlo en el proceso hijo. */
const HELPER = businessWallClock.toString().replace('BUSINESS_TIME_ZONE', `'${BUSINESS_TIME_ZONE}'`);

describe('hora de pared del local', () => {
  it('la zona del negocio es Bogotá', () => {
    expect(BUSINESS_TIME_ZONE).toBe('America/Bogota');
  });

  it('las 21:35 UTC son las 16:35 del local', () => {
    const d = businessWallClock(new Date('2026-08-30T21:35:00.000Z'));
    expect([d.getHours(), d.getMinutes()]).toEqual([16, 35]);
  });

  /** El caso que rompía el horario de la web y la franja de las promociones. */
  it('a las 8 pm del local todavía es HOY, no mañana', () => {
    // 2026-08-31 01:00 UTC = domingo 30 a las 20:00 en Bogotá.
    const d = businessWallClock(new Date('2026-08-31T01:00:00.000Z'));
    expect([d.getDate(), d.getDay(), d.getHours()]).toEqual([30, 0, 20]);
  });

  it('la medianoche del local es la hora 0, no la 24 del día anterior', () => {
    const d = businessWallClock(new Date('2026-08-31T05:00:00.000Z'));
    expect([d.getDate(), d.getHours()]).toEqual([31, 0]);
  });

  it('EN UN SERVIDOR EN UTC da lo mismo que acá', () => {
    const salida = enUTC(
      `(${HELPER})(new Date('2026-08-31T01:00:00.000Z')) .toString().slice(0,24)`,
    );
    // Domingo 30 de agosto, 20:00 — leído por un proceso cuyo reloj es UTC.
    expect(salida).toContain('Sun Aug 30 2026 20:00:00');
  });

  it('sin la conversión, ese mismo servidor diría LUNES 31 a la 1 am', () => {
    // Prueba de que el caso de arriba no pasa por casualidad.
    const crudo = enUTC(`new Date('2026-08-31T01:00:00.000Z').toString().slice(0,24)`);
    expect(crudo).toContain('Mon Aug 31 2026 01:00:00');
  });
});
