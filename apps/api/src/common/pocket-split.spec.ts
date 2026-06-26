import { BadRequestException } from '@nestjs/common';
import { parseOptionalAmount, resolvePocketSplit } from './pocket-split';

describe('resolvePocketSplit', () => {
  it('default a CUENTA cuando no se especifica nada', () => {
    expect(resolvePocketSplit(undefined, undefined, 50_000)).toEqual({ cash: 0, bank: 50_000 });
  });

  it('default redondea el total a 2 decimales', () => {
    expect(resolvePocketSplit(undefined, undefined, 99.999)).toEqual({ cash: 0, bank: 100 });
  });

  it('solo efectivo: el resto va a cuenta', () => {
    expect(resolvePocketSplit(30_000, undefined, 50_000)).toEqual({ cash: 30_000, bank: 20_000 });
  });

  it('efectivo == total: cuenta queda en 0', () => {
    expect(resolvePocketSplit(50_000, undefined, 50_000)).toEqual({ cash: 50_000, bank: 0 });
  });

  it('solo cuenta especificada: efectivo es 0 y debe cuadrar al total', () => {
    expect(resolvePocketSplit(undefined, 50_000, 50_000)).toEqual({ cash: 0, bank: 50_000 });
  });

  it('reparto explícito efectivo + cuenta que suma el total', () => {
    expect(resolvePocketSplit(20_000, 30_000, 50_000)).toEqual({ cash: 20_000, bank: 30_000 });
  });

  it('redondea el efectivo a 2 decimales (10.125 → 10.13) y la cuenta toma el resto', () => {
    expect(resolvePocketSplit(10.125, undefined, 50)).toEqual({ cash: 10.13, bank: 39.87 });
  });

  it('tolera diferencia de redondeo ≤ 0.01', () => {
    expect(resolvePocketSplit(33.33, 33.34, 66.67)).toEqual({ cash: 33.33, bank: 33.34 });
  });

  it('rechaza efectivo negativo', () => {
    expect(() => resolvePocketSplit(-1, 50_001, 50_000)).toThrow(BadRequestException);
  });

  it('rechaza cuenta negativa (efectivo > total con bank explícito)', () => {
    expect(() => resolvePocketSplit(60_000, -10_000, 50_000)).toThrow(BadRequestException);
  });

  it('rechaza cuando efectivo + cuenta NO suma el total', () => {
    expect(() => resolvePocketSplit(20_000, 20_000, 50_000)).toThrow(BadRequestException);
  });

  it('rechaza cuando la suma excede el total más allá de la tolerancia', () => {
    expect(() => resolvePocketSplit(30_000, 30_000, 50_000)).toThrow(BadRequestException);
  });
});

describe('parseOptionalAmount', () => {
  it('undefined cuando ausente', () => {
    expect(parseOptionalAmount(undefined)).toBeUndefined();
  });

  it('undefined cuando string vacío', () => {
    expect(parseOptionalAmount('')).toBeUndefined();
  });

  it('parsea un número válido', () => {
    expect(parseOptionalAmount('12500')).toBe(12_500);
  });

  it('parsea decimales', () => {
    expect(parseOptionalAmount('12.5')).toBe(12.5);
  });

  it('parsea 0 (no lo trata como vacío)', () => {
    expect(parseOptionalAmount('0')).toBe(0);
  });

  it('rechaza texto no numérico', () => {
    expect(() => parseOptionalAmount('abc')).toThrow(BadRequestException);
  });

  it('rechaza NaN/Infinity', () => {
    expect(() => parseOptionalAmount('Infinity')).toThrow(BadRequestException);
  });
});
