import { describe, expect, it } from 'vitest';
import { INVOICE_EXTRACTION_SYSTEM, normalizeExtractedInvoice, normalizeExtractedItems } from './prompt';

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

/**
 * `normalizeExtractedInvoice` es el normalizador ÚNICO de la extracción: los
 * adapters de Anthropic y OpenAI tenían la misma lista de defaults copiada, así
 * que agregar un campo (como `freight`) obligaba a acordarse de los dos y el
 * olvido solo aparecía en el Zod parse, en producción.
 */
describe('normalizeExtractedInvoice', () => {
  it('rellena items, warnings y freight cuando el modelo los omite', () => {
    const out = normalizeExtractedInvoice({ total: 100 });
    expect(out.items).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(out.freight).toBeNull();
  });

  it('respeta el flete que sí vino (incluido 0, que es "cobró $0", no "no trae")', () => {
    expect(normalizeExtractedInvoice({ freight: 8000 }).freight).toBe(8000);
    expect(normalizeExtractedInvoice({ freight: 0 }).freight).toBe(0);
  });

  it('freight null explícito se conserva', () => {
    expect(normalizeExtractedInvoice({ freight: null }).freight).toBeNull();
  });

  it('normaliza el empaque de cada ítem de paso', () => {
    const out = normalizeExtractedInvoice({ items: [{ descriptionRaw: 'Pan' }] });
    expect((out.items as Array<Record<string, unknown>>)[0]).toMatchObject({
      descriptionRaw: 'Pan',
      packUnits: null,
    });
  });

  it('no muta el objeto de entrada', () => {
    const input = { total: 1 };
    normalizeExtractedInvoice(input);
    expect(input).toEqual({ total: 1 });
  });
});

describe('INVOICE_EXTRACTION_SYSTEM', () => {
  it('le pide a la IA el flete aparte y le prohíbe cargarlo como ítem', () => {
    // Sin esta instrucción la IA extrae "DOMICILIO $8.000" como una línea más,
    // que no matchea ningún insumo y hay que borrar a mano en cada factura.
    expect(INVOICE_EXTRACTION_SYSTEM).toContain('"freight": number | null');
    expect(INVOICE_EXTRACTION_SYSTEM).toMatch(/NO se incluye en .?items/);
  });
});
