import { describe, expect, it } from 'vitest';
import { SetEmploymentSchema } from './users';

/**
 * El empleo define cuánto se le paga a alguien. Un salario en 0 con tipo de pago
 * activo genera semanas de nómina de $0 sin que nadie se entere hasta el reclamo;
 * 7 días de descanso dejaría al empleado sin ningún día liquidable.
 */

function reasons(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? '' : r.error!.issues.map((i) => i.message).join(' | ');
}

describe('SetEmploymentSchema — salario coherente con el tipo de pago', () => {
  it('rechaza tipo de pago con salario 0', () => {
    const r = SetEmploymentSchema.safeParse({ payType: 'DAILY', salaryAmount: 0 });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/mayor a 0/);
  });

  it('rechaza tipo de pago con salario null', () => {
    expect(SetEmploymentSchema.safeParse({ payType: 'DAILY', salaryAmount: null }).success).toBe(
      false,
    );
  });

  it('acepta tipo de pago con salario positivo', () => {
    expect(
      SetEmploymentSchema.safeParse({ payType: 'DAILY', salaryAmount: 60_000 }).success,
    ).toBe(true);
  });

  it('permite desvincular: sin tipo de pago y sin salario', () => {
    expect(SetEmploymentSchema.safeParse({ payType: null, salaryAmount: null }).success).toBe(true);
  });

  it('rechaza salario negativo', () => {
    expect(
      SetEmploymentSchema.safeParse({ payType: 'MONTHLY', salaryAmount: -1 }).success,
    ).toBe(false);
  });
});

describe('SetEmploymentSchema — días de descanso', () => {
  const base = { payType: 'DAILY' as const, salaryAmount: 60_000 };

  it('rechaza marcar los 7 días como descanso (no quedaría día liquidable)', () => {
    const r = SetEmploymentSchema.safeParse({
      ...base,
      restDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/7 días/);
  });

  it('acepta hasta 6 días de descanso', () => {
    expect(
      SetEmploymentSchema.safeParse({ ...base, restDaysOfWeek: [0, 1, 2, 3, 4, 5] }).success,
    ).toBe(true);
  });

  it('deduplica y ordena los días', () => {
    const r = SetEmploymentSchema.parse({ ...base, restDaysOfWeek: [3, 1, 3, 1] });
    expect(r.restDaysOfWeek).toEqual([1, 3]);
  });

  it('7 días repetidos que colapsan a menos SÍ pasan (se cuenta tras deduplicar)', () => {
    const r = SetEmploymentSchema.safeParse({ ...base, restDaysOfWeek: [1, 1, 1, 1, 1, 1, 1] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.restDaysOfWeek).toEqual([1]);
  });

  it('rechaza índices fuera del rango 0..6', () => {
    expect(SetEmploymentSchema.safeParse({ ...base, restDaysOfWeek: [7] }).success).toBe(false);
    expect(SetEmploymentSchema.safeParse({ ...base, restDaysOfWeek: [-1] }).success).toBe(false);
  });

  it('acepta lista vacía (trabaja todos los días)', () => {
    expect(SetEmploymentSchema.safeParse({ ...base, restDaysOfWeek: [] }).success).toBe(true);
  });
});
