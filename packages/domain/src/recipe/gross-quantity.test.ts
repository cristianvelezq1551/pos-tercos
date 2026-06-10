import { describe, expect, it } from 'vitest';
import { grossQuantity, RecipeInvalidMermaError } from './expand-recipe';

describe('grossQuantity (merma)', () => {
  it('sin merma devuelve la cantidad neta', () => {
    expect(grossQuantity(100, 0)).toBe(100);
  });

  it('aplica merma: 100g neto con 20% merma = 125g bruto', () => {
    expect(grossQuantity(100, 0.2)).toBeCloseTo(125);
  });

  it('rechaza mermaPct = 1 (división por cero → Infinity)', () => {
    expect(() => grossQuantity(100, 1)).toThrow(RecipeInvalidMermaError);
  });

  it('rechaza mermaPct > 1', () => {
    expect(() => grossQuantity(100, 1.5)).toThrow(RecipeInvalidMermaError);
  });

  it('rechaza mermaPct negativa', () => {
    expect(() => grossQuantity(100, -0.1)).toThrow(RecipeInvalidMermaError);
  });

  it('rechaza mermaPct no finita (NaN de un Decimal corrupto)', () => {
    expect(() => grossQuantity(100, Number.NaN)).toThrow(RecipeInvalidMermaError);
  });
});
