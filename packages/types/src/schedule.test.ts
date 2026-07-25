import { describe, expect, it } from 'vitest';
import { DateOverrideSchema, OpeningHoursSchema, TimeRangeSchema } from './schedule';

/**
 * El horario decide si la web ACEPTA pedidos (gate real: fuera de horario el
 * backend responde 503). Un rango mal validado deja el local "abierto" 24h o
 * cerrado todo el día sin que nadie lo note hasta que entran pedidos imposibles.
 */

const emptyWeek = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };

describe('TimeRangeSchema', () => {
  it('acepta un rango normal en 24h', () => {
    expect(TimeRangeSchema.safeParse({ start: '17:00', end: '23:00' }).success).toBe(true);
  });

  it('acepta un rango que cruza medianoche (end < start)', () => {
    expect(TimeRangeSchema.safeParse({ start: '18:00', end: '02:00' }).success).toBe(true);
  });

  it('rechaza inicio y fin iguales (ventana de 0 minutos)', () => {
    const r = TimeRangeSchema.safeParse({ start: '17:00', end: '17:00' });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toMatch(/misma hora/);
  });

  it.each([
    ['formato 12h', '5:00pm'],
    ['hora 24', '24:00'],
    ['minutos inválidos', '17:60'],
    ['sin cero a la izquierda', '7:00'],
    ['con segundos', '17:00:00'],
  ])('rechaza %s', (_label, start) => {
    expect(TimeRangeSchema.safeParse({ start, end: '23:00' }).success).toBe(false);
  });

  it('acepta los extremos 00:00 y 23:59', () => {
    expect(TimeRangeSchema.safeParse({ start: '00:00', end: '23:59' }).success).toBe(true);
  });
});

describe('OpeningHoursSchema — semana', () => {
  const base = { weekly: emptyWeek, overrides: [], restDayHolidayShift: false };

  it('una semana entera cerrada es válida (el local decide)', () => {
    expect(OpeningHoursSchema.safeParse(base).success).toBe(true);
  });

  it('acepta hasta 4 rangos por día (almuerzo + noche y de sobra)', () => {
    const range = { start: '10:00', end: '11:00' };
    const cuatro = { ...base, weekly: { ...emptyWeek, mon: Array(4).fill(range) } };
    const cinco = { ...base, weekly: { ...emptyWeek, mon: Array(5).fill(range) } };
    expect(OpeningHoursSchema.safeParse(cuatro).success).toBe(true);
    expect(OpeningHoursSchema.safeParse(cinco).success).toBe(false);
  });

  it('exige los 7 días (un día ausente sería "cerrado" por accidente)', () => {
    const { sat: _falta, ...seisDias } = emptyWeek;
    expect(OpeningHoursSchema.safeParse({ ...base, weekly: seisDias }).success).toBe(false);
  });
});

describe('OpeningHoursSchema — excepciones por fecha', () => {
  const base = { weekly: emptyWeek, overrides: [], restDayHolidayShift: false };
  const override = { date: '2026-12-25', closed: true, ranges: [] };

  it('acepta una excepción puntual', () => {
    expect(OpeningHoursSchema.safeParse({ ...base, overrides: [override] }).success).toBe(true);
  });

  it('rechaza DOS excepciones para la misma fecha (cuál gana sería indefinido)', () => {
    const r = OpeningHoursSchema.safeParse({
      ...base,
      overrides: [override, { ...override, closed: false, ranges: [{ start: '17:00', end: '20:00' }] }],
    });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toMatch(/misma fecha/);
  });

  it('acepta excepciones de fechas distintas', () => {
    expect(
      OpeningHoursSchema.safeParse({
        ...base,
        overrides: [override, { ...override, date: '2026-12-31' }],
      }).success,
    ).toBe(true);
  });

  it('topa la lista de excepciones en 60', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...override,
        date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      }));
    expect(OpeningHoursSchema.safeParse({ ...base, overrides: many(60) }).success).toBe(true);
    expect(OpeningHoursSchema.safeParse({ ...base, overrides: many(61) }).success).toBe(false);
  });
});

describe('DateOverrideSchema', () => {
  it('exige la fecha en YYYY-MM-DD', () => {
    expect(DateOverrideSchema.safeParse({ date: '25/12/2026', closed: true, ranges: [] }).success).toBe(
      false,
    );
  });

  it('acepta una nota corta y rechaza una larga', () => {
    const build = (note: string) =>
      DateOverrideSchema.safeParse({ date: '2026-12-25', closed: true, ranges: [], note }).success;
    expect(build('Navidad')).toBe(true);
    expect(build('x'.repeat(121))).toBe(false);
  });

  it('`ranges` es obligatorio (sin default: un default rompe el tipado del cliente)', () => {
    expect(DateOverrideSchema.safeParse({ date: '2026-12-25', closed: true }).success).toBe(false);
  });
});
