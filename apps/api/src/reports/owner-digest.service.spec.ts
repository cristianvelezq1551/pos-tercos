import { diaQueTermino } from './owner-digest.service';

/**
 * El resumen sale a las 00:00, cuando `new Date()` ya es el día siguiente y
 * está vacío. Un error de un día acá manda un resumen en blanco todas las
 * noches sin que nada falle: no hay excepción, no hay log, solo un texto que
 * dice que no se vendió nada.
 */
describe('diaQueTermino', () => {
  it('a la medianoche devuelve el día que acaba de terminar', () => {
    const d = diaQueTermino(new Date(2026, 8, 7, 0, 0, 0, 0));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(6);
  });

  it('sigue apuntando al mismo día si el cron arranca tarde', () => {
    // Proceso ocupado o recién reiniciado: dispara 47 minutos después.
    const d = diaQueTermino(new Date(2026, 8, 7, 0, 47, 12));
    expect(d.getDate()).toBe(6);
  });

  it('cruza el borde del mes', () => {
    const d = diaQueTermino(new Date(2026, 9, 1, 0, 0, 0));
    expect(d.getMonth()).toBe(8); // septiembre
    expect(d.getDate()).toBe(30);
  });

  it('cruza el borde del año', () => {
    const d = diaQueTermino(new Date(2027, 0, 1, 0, 0, 0));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });

  it('cae dentro del día, no en su borde exacto: la ventana del resumen lo incluye', () => {
    const d = diaQueTermino(new Date(2026, 8, 7, 0, 0, 0));
    const inicio = new Date(2026, 8, 6, 0, 0, 0, 0);
    const fin = new Date(2026, 8, 6, 23, 59, 59, 999);
    expect(d.getTime()).toBeGreaterThanOrEqual(inicio.getTime());
    expect(d.getTime()).toBeLessThanOrEqual(fin.getTime());
  });
});
