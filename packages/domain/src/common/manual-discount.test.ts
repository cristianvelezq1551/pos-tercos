import { describe, expect, it } from 'vitest';
import { manualDiscountAmount } from './manual-discount';

describe('manualDiscountAmount', () => {
  it('FIXED descuenta el monto exacto', () => {
    expect(manualDiscountAmount(10_000, { kind: 'FIXED', value: 2_000 })).toBe(2_000);
  });

  it('FIXED se capa a la base (no deja negativo)', () => {
    expect(manualDiscountAmount(1_500, { kind: 'FIXED', value: 5_000 })).toBe(1_500);
  });

  it('PERCENT calcula sobre la base con redondeo canónico', () => {
    expect(manualDiscountAmount(9_900, { kind: 'PERCENT', value: 10 })).toBe(990);
    expect(manualDiscountAmount(3_333, { kind: 'PERCENT', value: 15 })).toBe(499.95);
  });

  it('PERCENT 100 descuenta todo; >100 se capa a 100', () => {
    expect(manualDiscountAmount(8_000, { kind: 'PERCENT', value: 100 })).toBe(8_000);
    expect(manualDiscountAmount(8_000, { kind: 'PERCENT', value: 150 })).toBe(8_000);
  });

  it('base no positiva o value inválido → 0', () => {
    expect(manualDiscountAmount(0, { kind: 'FIXED', value: 1_000 })).toBe(0);
    expect(manualDiscountAmount(-100, { kind: 'PERCENT', value: 10 })).toBe(0);
    expect(manualDiscountAmount(1_000, { kind: 'FIXED', value: 0 })).toBe(0);
    expect(manualDiscountAmount(1_000, { kind: 'FIXED', value: Number.NaN })).toBe(0);
  });
});
