import { describe, expect, it } from 'vitest';
import { formatNumber } from '../../../lib/format';

/**
 * La tabla de conteos mostraba "700,0000" y "−50,0000": cuatro decimales fijos
 * para cantidades que casi siempre son enteras. El dato se guarda con 4
 * decimales (una báscula puede dar 0,25 g), pero mostrarlos siempre es ruido
 * justo en la pantalla donde se comparan dos números a ojo.
 */
describe('cantidades del conteo', () => {
  it('un entero se muestra sin decimales', () => {
    expect(formatNumber(700, { maxDecimals: 4 })).toBe('700');
    expect(formatNumber(-50, { maxDecimals: 4 })).toBe('-50');
    expect(formatNumber(0, { maxDecimals: 4 })).toBe('0');
  });

  it('los decimales que SÍ existen se conservan', () => {
    expect(formatNumber(0.25, { maxDecimals: 4 })).toBe('0,25');
    expect(formatNumber(1.5, { maxDecimals: 4 })).toBe('1,5');
  });

  it('mantiene el separador de miles (un gramaje grande se lee)', () => {
    expect(formatNumber(2250, { maxDecimals: 4 })).toBe('2.250');
  });

  it('sin opciones sigue el comportamiento de siempre (4 fijos)', () => {
    expect(formatNumber(700)).toBe('700,0000');
  });
});
