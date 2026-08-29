import { describe, expect, it } from 'vitest';
import { bucketOf, bucketsBetween } from './period-buckets';

/** Fecha LOCAL (no UTC): el bucketing es local a propósito. */
const local = (y: number, m1: number, d: number, h = 12): Date =>
  new Date(y, m1 - 1, d, h);

describe('bucketOf — semana', () => {
  it('la semana va de lunes a domingo', () => {
    // Jueves 27 ago 2026 → semana del lunes 24 al domingo 30.
    const b = bucketOf(local(2026, 8, 27), 'weekly');
    expect(b.from).toBe('2026-08-24');
    expect(b.to).toBe('2026-08-30');
  });

  it('el domingo pertenece a la semana que ARRANCÓ el lunes anterior', () => {
    // El error clásico: getDay() del domingo es 0, y restar 1 día lo manda a
    // la semana equivocada. Una compra del domingo tiene que quedar con la
    // semana que la persona vivió, no con la que empieza al día siguiente.
    const domingo = bucketOf(local(2026, 8, 30), 'weekly');
    const jueves = bucketOf(local(2026, 8, 27), 'weekly');
    expect(domingo.key).toBe(jueves.key);
    expect(domingo.from).toBe('2026-08-24');
  });

  it('el lunes abre semana nueva', () => {
    const lunes = bucketOf(local(2026, 8, 31), 'weekly');
    const domingoAnterior = bucketOf(local(2026, 8, 30), 'weekly');
    expect(lunes.key).not.toBe(domingoAnterior.key);
    expect(lunes.from).toBe('2026-08-31');
  });

  it('una compra a las 23:00 del domingo NO se pasa a la semana siguiente', () => {
    // Si el corte fuera en UTC, en Bogotá (UTC−5) las 19:00 del domingo ya
    // serían lunes y la compra saltaría de semana.
    const tarde = bucketOf(local(2026, 8, 30, 23), 'weekly');
    expect(tarde.from).toBe('2026-08-24');
  });

  it('la etiqueta omite el mes repetido, y lo pone cuando la semana lo cruza', () => {
    expect(bucketOf(local(2026, 8, 27), 'weekly').label).toBe('24–30 ago');
    // Semana del lunes 31 ago al domingo 6 sep.
    expect(bucketOf(local(2026, 9, 2), 'weekly').label).toBe('31 ago – 6 sep');
  });

  it('la clave ordena cronológicamente como texto', () => {
    const a = bucketOf(local(2026, 8, 27), 'weekly').key;
    const b = bucketOf(local(2026, 9, 8), 'weekly').key;
    expect(a < b).toBe(true);
  });
});

describe('bucketOf — mes', () => {
  it('cubre el mes completo, con el último día correcto', () => {
    const b = bucketOf(local(2026, 2, 14), 'monthly');
    expect(b.key).toBe('2026-02');
    expect(b.from).toBe('2026-02-01');
    expect(b.to).toBe('2026-02-28');
    expect(b.label).toBe('febrero 2026');
  });

  it('el último día del mes sigue siendo de ese mes', () => {
    const b = bucketOf(local(2026, 8, 31, 23), 'monthly');
    expect(b.key).toBe('2026-08');
  });
});

describe('bucketsBetween', () => {
  it('incluye los períodos SIN compras (un hueco es información)', () => {
    const bs = bucketsBetween(local(2026, 8, 3), local(2026, 8, 30), 'weekly');
    expect(bs.map((b) => b.from)).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
    ]);
  });

  it('un rango de un solo día devuelve su período', () => {
    const bs = bucketsBetween(local(2026, 8, 27), local(2026, 8, 27), 'weekly');
    expect(bs).toHaveLength(1);
    expect(bs[0].from).toBe('2026-08-24');
  });

  it('meses consecutivos salen en orden y sin repetir', () => {
    const bs = bucketsBetween(local(2026, 6, 15), local(2026, 9, 2), 'monthly');
    expect(bs.map((b) => b.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('devuelve vacío si el rango está invertido (no cuelga)', () => {
    expect(bucketsBetween(local(2026, 9, 1), local(2026, 8, 1), 'weekly')).toEqual([]);
  });
});
