import { distanceToCsvDate } from './reconciliation.service';

/**
 * El extracto del banco trae la fecha, no la hora. Interpretarla como un
 * instante UTC la corría a las 7 p.m. del día anterior en Bogotá, y la
 * ventana de tolerancia cerraba a las 7 p.m. del día del extracto: ningún
 * pago digital de la noche matcheaba con su propia línea del banco. Peor que
 * un match perdido — la línea quedaba marcada como "plata en el banco sin
 * venta en el POS", que es la alarma de fraude.
 *
 * Este negocio vende de noche, así que el caso raro era el que funcionaba.
 */
const dia = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)); // como lo deja el parser del CSV
};
const local = (iso: string): Date => new Date(`${iso}-05:00`); // Bogotá
const HORA = 60 * 60 * 1000;

describe('distanceToCsvDate', () => {
  const extracto = dia('2026-07-25');

  it.each([
    ['al abrir, 11 a.m.', '2026-07-25T11:00:00'],
    ['EL CASO ROTO: 7:50 p.m.', '2026-07-25T19:50:00'],
    ['pico de la noche, 10 p.m.', '2026-07-25T22:00:00'],
    ['el último minuto del día', '2026-07-25T23:59:00'],
    ['el primer minuto del día', '2026-07-25T00:01:00'],
  ])('un pago del %s cae dentro del día del extracto', (_caso, hora) => {
    expect(distanceToCsvDate(local(hora), extracto)).toBe(0);
  });

  it('un pago de la madrugada siguiente entra por tolerancia, no por coincidencia', () => {
    // 1 a.m. del 26: fuera del día, pero a 1 hora — el banco acredita tarde.
    expect(distanceToCsvDate(local('2026-07-26T01:00:00'), extracto)).toBe(HORA);
  });

  it('mide la distancia contra el borde del día, no contra su medianoche', () => {
    // 11 p.m. del día ANTERIOR: 1 hora antes de que empiece el día del extracto.
    expect(distanceToCsvDate(local('2026-07-24T23:00:00'), extracto)).toBe(HORA);
  });

  it('un pago de tres días antes queda lejos y no matchea', () => {
    const dt = distanceToCsvDate(local('2026-07-22T12:00:00'), extracto);
    expect(dt).toBeGreaterThan(24 * HORA);
  });

  it('si la línea SÍ trae hora es un instante y se compara como tal', () => {
    const conHora = new Date(Date.UTC(2026, 6, 25, 18, 30));
    expect(distanceToCsvDate(conHora, conHora)).toBe(0);
    expect(distanceToCsvDate(new Date(conHora.getTime() + 2 * HORA), conHora)).toBe(2 * HORA);
  });
});
