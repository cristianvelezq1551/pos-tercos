import { describe, expect, it } from 'vitest';
import { colombianHolidays, easterSunday } from './colombia-holidays';
import { nextWeekRef, payrollWeekFor, prevWeekRef } from './operating-week';

const utc = (s: string): Date => new Date(`${s}T12:00:00.000Z`);

describe('colombianHolidays', () => {
  it('Pascua 2026 = 5 de abril', () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('incluye festivos fijos y trasladados de 2026', () => {
    const h = colombianHolidays(2026);
    // Fijos.
    expect(h.has('2026-01-01')).toBe(true); // Año Nuevo
    expect(h.has('2026-05-01')).toBe(true); // Trabajo
    expect(h.has('2026-07-20')).toBe(true); // Independencia
    expect(h.has('2026-08-07')).toBe(true); // Boyacá
    expect(h.has('2026-12-25')).toBe(true); // Navidad
    // Emiliani: Reyes (6 ene 2026 es martes) → lunes 12 ene.
    expect(h.has('2026-01-12')).toBe(true);
    expect(h.has('2026-01-06')).toBe(false);
    // Semana Santa 2026: Jueves 2 abr, Viernes 3 abr.
    expect(h.has('2026-04-02')).toBe(true);
    expect(h.has('2026-04-03')).toBe(true);
  });

  it('un festivo que cae lunes no se mueve', () => {
    // 6 de enero de 2025 es lunes → Reyes queda el mismo 6.
    const h = colombianHolidays(2025);
    expect(h.has('2025-01-06')).toBe(true);
  });
});

describe('payrollWeekFor (semana = corrida entre descansos)', () => {
  it('semana normal: martes a domingo (lunes descanso, no incluido)', () => {
    // Febrero 2026 no tiene festivos colombianos → semana limpia.
    const w = payrollWeekFor(utc('2026-02-11'));
    expect(w.weekStart).toBe('2026-02-10'); // martes
    expect(w.weekEnd).toBe('2026-02-15'); // domingo
    expect(w.days).toHaveLength(6);
    expect(w.days.every((d) => d.status === 'WORKDAY')).toBe(true);
    expect(w.days.some((d) => d.weekday === 1)).toBe(false); // sin lunes
  });

  it('lunes festivo: la semana CIERRA en el lunes festivo (se paga)', () => {
    // Lunes 2026-01-12 (Reyes trasladado) es festivo; el lunes anterior (5-ene)
    // y el siguiente (19-ene) son normales. La semana cierra en el lunes festivo.
    const w = payrollWeekFor(utc('2026-01-12'));
    expect(w.weekEnd).toBe('2026-01-12'); // cierra en el lunes festivo
    const last = w.days[w.days.length - 1];
    expect(last.date).toBe('2026-01-12');
    expect(last.weekday).toBe(1); // lunes
    expect(last.isHoliday).toBe(true);
    expect(last.status).toBe('WORKDAY'); // se trabaja y se paga
    expect(w.weekStart).toBe('2026-01-06'); // martes anterior
    expect(w.days).toHaveLength(7); // martes…lunes festivo
  });

  it('la semana siguiente a un lunes festivo arranca el miércoles', () => {
    const holidayWeek = payrollWeekFor(utc('2026-01-12')); // cierra lunes 12-ene festivo
    const next = payrollWeekFor(new Date(`${nextWeekRef(holidayWeek)}T12:00:00.000Z`));
    expect(next.weekStart).toBe('2026-01-14'); // miércoles (martes 13 es el descanso corrido)
    expect(next.weekEnd).toBe('2026-01-18'); // domingo
    expect(next.days[0].weekday).toBe(3); // miércoles
  });

  it('navegación prev/next es consistente', () => {
    const w = payrollWeekFor(utc('2026-06-24'));
    const next = payrollWeekFor(new Date(`${nextWeekRef(w)}T12:00:00.000Z`));
    const backToW = payrollWeekFor(new Date(`${prevWeekRef(next)}T12:00:00.000Z`));
    expect(backToW.weekStart).toBe(w.weekStart);
    expect(backToW.weekEnd).toBe(w.weekEnd);
  });
});
