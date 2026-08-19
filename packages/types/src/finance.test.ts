import { describe, expect, it } from 'vitest';
import { CreateFixedCostSchema, UpdateFixedCostSchema } from './fixed-costs';
import { CreateAdjustmentSchema, CreateTransferSchema } from './treasury';
import { AddWeeklyAdjustmentSchema, PayWeekDaysSchema } from './workers';

/**
 * Schemas que mueven plata del negocio: costos fijos (entran al P&G), tesorería
 * (bolsillos Efectivo/Cuenta) y nómina. Un cero o un signo que se cuelan acá
 * quedan como asiento sin efecto o como movimiento imposible de conciliar.
 */

const UUID = '77777777-7777-4777-8777-777777777777';

function reasons(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? '' : r.error!.issues.map((i) => i.message).join(' | ');
}

describe('CreateFixedCostSchema — un gasto puntual necesita fecha', () => {
  const base = { name: 'Arriendo', amount: 4_000_000, category: 'Alquiler' };

  it('ONE_TIME sin fecha se rechaza (no se sabe a qué mes pega en el P&G)', () => {
    const r = CreateFixedCostSchema.safeParse({ ...base, frequency: 'ONE_TIME' });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/gasto puntual requiere la fecha/);
  });

  it('ONE_TIME con fecha pasa', () => {
    expect(
      CreateFixedCostSchema.safeParse({
        ...base,
        frequency: 'ONE_TIME',
        startedAt: '2026-07-22',
      }).success,
    ).toBe(true);
  });

  it.each(['MONTHLY', 'ANNUAL'])('%s no necesita fecha', (frequency) => {
    expect(CreateFixedCostSchema.safeParse({ ...base, frequency }).success).toBe(true);
  });

  it('exige la fecha en formato YYYY-MM-DD', () => {
    expect(
      CreateFixedCostSchema.safeParse({
        ...base,
        frequency: 'ONE_TIME',
        startedAt: '22-07-2026',
      }).success,
    ).toBe(false);
  });

  it('rechaza monto negativo pero acepta 0', () => {
    expect(
      CreateFixedCostSchema.safeParse({ ...base, frequency: 'MONTHLY', amount: -1 }).success,
    ).toBe(false);
    expect(
      CreateFixedCostSchema.safeParse({ ...base, frequency: 'MONTHLY', amount: 0 }).success,
    ).toBe(true);
  });
});

describe('UpdateFixedCostSchema — la regla solo aplica si se toca la frecuencia', () => {
  it('cambiar a ONE_TIME sin fecha se rechaza', () => {
    const r = UpdateFixedCostSchema.safeParse({ frequency: 'ONE_TIME' });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/gasto puntual requiere la fecha/);
  });

  it('editar solo el monto no dispara la regla', () => {
    expect(UpdateFixedCostSchema.safeParse({ amount: 5_000_000 }).success).toBe(true);
  });

  it('permite desactivar el costo', () => {
    expect(UpdateFixedCostSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('CreateTransferSchema — traspaso entre bolsillos', () => {
  const base = { fromPocket: 'EFECTIVO', toPocket: 'CUENTA', amount: 500_000, reason: 'Consignación' };

  it('acepta un traspaso entre bolsillos distintos', () => {
    expect(CreateTransferSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza mover plata al MISMO bolsillo (asiento sin efecto)', () => {
    const r = CreateTransferSchema.safeParse({ ...base, toPocket: 'EFECTIVO' });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/deben ser distintos/);
  });

  it('rechaza monto 0 o negativo (el sentido lo da from→to)', () => {
    expect(CreateTransferSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(CreateTransferSchema.safeParse({ ...base, amount: -1 }).success).toBe(false);
  });

  it('exige un motivo con sustancia (queda en la bitácora)', () => {
    expect(CreateTransferSchema.safeParse({ ...base, reason: 'ab' }).success).toBe(false);
    expect(CreateTransferSchema.safeParse({ ...base, reason: 'abc' }).success).toBe(true);
  });
});

describe('CreateAdjustmentSchema — ajuste con signo', () => {
  const base = { pocket: 'EFECTIVO', amount: -20_000, reason: 'Faltante de arqueo' };

  it('acepta ajuste negativo y positivo', () => {
    expect(CreateAdjustmentSchema.safeParse(base).success).toBe(true);
    expect(CreateAdjustmentSchema.safeParse({ ...base, amount: 20_000 }).success).toBe(true);
  });

  it('rechaza un ajuste de 0 (no ajusta nada)', () => {
    const r = CreateAdjustmentSchema.safeParse({ ...base, amount: 0 });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/no puede ser 0/);
  });
});

describe('PayWeekDaysSchema — abono de nómina por bolsillo', () => {
  const base = { userId: UUID, weekStart: '2026-07-20', cashAmount: 300_000, bankAmount: 0 };

  it('acepta pago solo en efectivo o solo por cuenta', () => {
    expect(PayWeekDaysSchema.safeParse(base).success).toBe(true);
    expect(
      PayWeekDaysSchema.safeParse({ ...base, cashAmount: 0, bankAmount: 300_000 }).success,
    ).toBe(true);
  });

  it('acepta pago mixto entre los dos bolsillos', () => {
    expect(
      PayWeekDaysSchema.safeParse({ ...base, cashAmount: 100_000, bankAmount: 200_000 }).success,
    ).toBe(true);
  });

  it('rechaza un abono de 0 en ambos bolsillos', () => {
    const r = PayWeekDaysSchema.safeParse({ ...base, cashAmount: 0, bankAmount: 0 });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/no puede ser 0/);
  });

  it('rechaza montos negativos (para descontar está el ajuste semanal)', () => {
    expect(
      PayWeekDaysSchema.safeParse({ ...base, cashAmount: -1, bankAmount: 300_000 }).success,
    ).toBe(false);
  });

  it('los días cubiertos por defecto son lista vacía', () => {
    const r = PayWeekDaysSchema.parse(base);
    expect(r.days).toEqual([]);
  });

  it('exige weekStart en formato fecha-solo', () => {
    expect(PayWeekDaysSchema.safeParse({ ...base, weekStart: '2026-07-20T00:00:00Z' }).success).toBe(
      false,
    );
  });
});

describe('AddWeeklyAdjustmentSchema — bono o descuento', () => {
  const base = { userId: UUID, weekStart: '2026-07-20', concept: 'Bono', amount: 50_000 };

  it('acepta bono (positivo) y descuento (negativo)', () => {
    expect(AddWeeklyAdjustmentSchema.safeParse(base).success).toBe(true);
    expect(AddWeeklyAdjustmentSchema.safeParse({ ...base, amount: -50_000 }).success).toBe(true);
  });

  it('rechaza un ajuste de 0', () => {
    expect(AddWeeklyAdjustmentSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
  });

  it('exige un concepto (el empleado tiene que entender el descuento)', () => {
    expect(AddWeeklyAdjustmentSchema.safeParse({ ...base, concept: '' }).success).toBe(false);
  });
});
