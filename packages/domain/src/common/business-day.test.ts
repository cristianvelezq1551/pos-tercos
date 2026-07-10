import { describe, expect, it } from 'vitest';
import {
  BUSINESS_DAY_CUTOFF_HOUR,
  businessDayWindow,
  sameBusinessDay,
  startOfBusinessDay,
} from './business-day';

// Fechas en hora LOCAL del runner (el helper es TZ-agnóstico: opera en local).
const local = (
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0,
  ms = 0,
): Date => new Date(y, m - 1, d, h, min, s, ms);

describe('startOfBusinessDay', () => {
  it('una tarde cualquiera pertenece al día de negocio de HOY (corte 4 am de hoy)', () => {
    expect(startOfBusinessDay(local(2026, 7, 9, 17, 0))).toEqual(
      local(2026, 7, 9, BUSINESS_DAY_CUTOFF_HOUR, 0),
    );
  });

  it('la madrugada (antes de las 4 am) pertenece al día de negocio de AYER', () => {
    expect(startOfBusinessDay(local(2026, 7, 10, 2, 0))).toEqual(
      local(2026, 7, 9, BUSINESS_DAY_CUTOFF_HOUR, 0),
    );
  });

  it('borde exacto: 03:59:59.999 es de ayer, 04:00:00.000 es de hoy', () => {
    expect(startOfBusinessDay(local(2026, 7, 10, 3, 59, 59, 999))).toEqual(
      local(2026, 7, 9, 4, 0),
    );
    expect(startOfBusinessDay(local(2026, 7, 10, 4, 0, 0, 0))).toEqual(
      local(2026, 7, 10, 4, 0),
    );
  });

  it('medianoche exacta pertenece al día de negocio anterior', () => {
    expect(startOfBusinessDay(local(2026, 7, 10, 0, 0))).toEqual(local(2026, 7, 9, 4, 0));
  });

  it('cruza el borde de mes: 1 de agosto 1 am es día de negocio del 31 de julio', () => {
    expect(startOfBusinessDay(local(2026, 8, 1, 1, 0))).toEqual(local(2026, 7, 31, 4, 0));
  });

  it('cruza el borde de año: 1 de enero 3 am es día de negocio del 31 de diciembre', () => {
    expect(startOfBusinessDay(local(2027, 1, 1, 3, 0))).toEqual(local(2026, 12, 31, 4, 0));
  });
});

describe('businessDayWindow', () => {
  it('la ventana va de 4 am a 4 am del día siguiente (end exclusivo)', () => {
    const { start, end } = businessDayWindow(local(2026, 7, 9, 17, 0));
    expect(start).toEqual(local(2026, 7, 9, 4, 0));
    expect(end).toEqual(local(2026, 7, 10, 4, 0));
  });

  it('la madrugada cae en la ventana del día anterior', () => {
    const { start, end } = businessDayWindow(local(2026, 7, 10, 2, 30));
    expect(start).toEqual(local(2026, 7, 9, 4, 0));
    expect(end).toEqual(local(2026, 7, 10, 4, 0));
  });
});

describe('sameBusinessDay', () => {
  it('jueves 5 pm y viernes 2 am son el MISMO día de negocio', () => {
    expect(sameBusinessDay(local(2026, 7, 9, 17, 0), local(2026, 7, 10, 2, 0))).toBe(true);
  });

  it('jueves 5 pm y viernes 5 pm son días de negocio distintos', () => {
    expect(sameBusinessDay(local(2026, 7, 9, 17, 0), local(2026, 7, 10, 17, 0))).toBe(false);
  });

  it('viernes 3:59 am y viernes 4:01 am son días de negocio distintos', () => {
    expect(sameBusinessDay(local(2026, 7, 10, 3, 59), local(2026, 7, 10, 4, 1))).toBe(false);
  });

  it('now − 24h SIEMPRE es un día de negocio anterior (invariante de los guards stale)', () => {
    const samples = [
      local(2026, 7, 10, 0, 30),
      local(2026, 7, 10, 3, 59),
      local(2026, 7, 10, 4, 0),
      local(2026, 7, 10, 12, 0),
      local(2026, 7, 10, 23, 59),
    ];
    for (const now of samples) {
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(sameBusinessDay(dayAgo, now)).toBe(false);
      expect(dayAgo < startOfBusinessDay(now)).toBe(true);
    }
  });
});
