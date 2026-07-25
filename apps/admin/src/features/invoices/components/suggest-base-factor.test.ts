import { describe, expect, it } from 'vitest';
import type { Stockable } from '@pos-tercos/types';
import { conversionSospechosa, suggestBaseFactor, unitsMatch } from './suggest-base-factor';

/**
 * La conversión de una factura al inventario es el punto donde un número mal
 * puesto hace el daño más silencioso del sistema: entra menos mercancía de la
 * que llegó Y el costo del insumo queda disparado, y ese costo después se usa
 * para calcular cuánto cuesta cada plato.
 *
 * Caso real que motivó estos tests: 1 kg de queso con factor 40 → entraron
 * 40 g en vez de 1.000, y el kilo quedó costando $750.000 habiendo pagado
 * $30.000.
 */
const queso: Stockable = {
  type: 'INGREDIENT',
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Queso',
  unitStock: 'g',
  unitPurchase: 'kg',
  conversionFactor: 1000,
  thresholdMin: 100,
  currentStock: 0,
  lowStock: false,
  isActive: true,
  blocksAvailability: true,
};

describe('suggestBaseFactor', () => {
  it('una factura en kg de un insumo que se compra en kg sugiere el factor del insumo', () => {
    expect(suggestBaseFactor(queso, { unit: 'kg' })).toBe(1000);
  });

  it('si la factura ya viene en la unidad de stock, el factor es 1', () => {
    expect(suggestBaseFactor(queso, { unit: 'g' })).toBe(1);
    expect(suggestBaseFactor(queso, { unit: 'gramos' })).toBe(1);
  });

  it('usa el desglose del empaque cuando la IA lo detecta (10 × 150 g)', () => {
    expect(
      suggestBaseFactor(queso, {
        unit: 'paquete',
        packUnits: 10,
        packSizePerUnit: 150,
        packSizeMeasure: 'g',
      }),
    ).toBe(1500);
  });

  it('con empaque en unidades sueltas sugiere las unidades del paquete', () => {
    const pan: Stockable = { ...queso, name: 'Pan', unitStock: 'unidad', unitPurchase: 'paquete', conversionFactor: 12 };
    expect(suggestBaseFactor(pan, { unit: 'paquete', packUnits: 12 })).toBe(12);
  });

  it('sin nada que lo indique cae al factor del insumo, nunca a 40 ni a un número inventado', () => {
    expect(suggestBaseFactor(queso, { unit: 'caja' })).toBe(1000);
  });
});

describe('unitsMatch — detecta si la factura viene en la unidad de compra', () => {
  it.each([
    ['kg', 'kg'],
    ['Kg', 'kg'],
    ['kgs', 'kg'],
    ['gramos', 'g'],
    ['unidades', 'unidad'],
    ['mililitros', 'ml'],
  ])('%s coincide con %s', (a, b) => {
    expect(unitsMatch(a, b)).toBe(true);
  });

  it.each([
    ['kg', 'g'],
    ['paquete', 'unidad'],
    ['caja', 'kg'],
  ])('%s NO coincide con %s', (a, b) => {
    expect(unitsMatch(a, b)).toBe(false);
  });
});

describe('conversionSospechosa — el aviso que evita el costo envenenado', () => {
  const queso = { lineUnit: 'kg', unitPurchase: 'kg', conversionFactor: 1000 };

  it('EL CASO REAL: 1 kg de queso con factor 40 se marca como sospechoso', () => {
    expect(conversionSospechosa({ ...queso, factorElegido: 40 })).toBe(true);
  });

  it('el factor correcto no molesta con un aviso', () => {
    expect(conversionSospechosa({ ...queso, factorElegido: 1000 })).toBe(false);
  });

  it('el pan: 1 paquete con factor 6 cuando el insumo dice 12', () => {
    expect(
      conversionSospechosa({
        lineUnit: 'paquete',
        unitPurchase: 'paquete',
        conversionFactor: 12,
        factorElegido: 6,
      }),
    ).toBe(true);
  });

  it('NO avisa si la factura viene en otra unidad: ahí el operador sí tiene que convertir', () => {
    // Compro por caja aunque el insumo se compre por kg: el factor legítimo es
    // "cuántos g trae la caja" y no tiene por qué ser 1.000.
    expect(
      conversionSospechosa({
        lineUnit: 'caja',
        unitPurchase: 'kg',
        conversionFactor: 1000,
        factorElegido: 12000,
      }),
    ).toBe(false);
  });

  it.each([
    ['sin unidad en la línea', { lineUnit: '', unitPurchase: 'kg', conversionFactor: 1000, factorElegido: 40 }],
    ['sin unidad de compra', { lineUnit: 'kg', unitPurchase: '', conversionFactor: 1000, factorElegido: 40 }],
    ['sin factor definido', { lineUnit: 'kg', unitPurchase: 'kg', conversionFactor: 0, factorElegido: 40 }],
  ])('no avisa cuando faltan datos para juzgar (%s)', (_caso, opts) => {
    expect(conversionSospechosa(opts)).toBe(false);
  });
});
