import { describe, expect, it } from 'vitest';
import { normalizeExtractedItems } from './prompt';

/**
 * §4.4: `normalizeExtractedItems` rellena las claves de empaque en null cuando el
 * LLM las omite, ANTES del Zod parse. Sin esto, un item sin esos campos rompía el
 * parse y toda la extracción de factura fallaba. Es lógica, no texto.
 */
describe('normalizeExtractedItems', () => {
  it('rellena packUnits/packSizePerUnit/packSizeMeasure en null si faltan', () => {
    const out = normalizeExtractedItems([{ description: 'Pollo', quantity: 2 }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0]).toMatchObject({
      description: 'Pollo',
      quantity: 2,
      packUnits: null,
      packSizePerUnit: null,
      packSizeMeasure: null,
    });
  });

  it('los valores PRESENTES ganan sobre el default null', () => {
    const out = normalizeExtractedItems([
      { description: 'Gaseosa', quantity: 1, packUnits: 24, packSizeMeasure: 'ml' },
    ]) as Array<Record<string, unknown>>;
    expect(out[0].packUnits).toBe(24);
    expect(out[0].packSizeMeasure).toBe('ml');
    expect(out[0].packSizePerUnit).toBeNull(); // este sí faltaba
  });

  it('no-array se devuelve tal cual', () => {
    expect(normalizeExtractedItems('nope')).toBe('nope');
    expect(normalizeExtractedItems(null)).toBeNull();
  });

  it('items no-objeto pasan sin tocar', () => {
    const out = normalizeExtractedItems([null, 42, { description: 'x' }]) as unknown[];
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(42);
    expect(out[2]).toMatchObject({ description: 'x', packUnits: null });
  });
});
