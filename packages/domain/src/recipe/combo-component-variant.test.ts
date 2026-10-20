import { describe, expect, it } from 'vitest';
import { comboComponentVariant } from './combo-component-variant';

const papas = { name: 'Papas TERCOS', sizes: [{ id: 's-pollo', name: 'Pollo y Miel ahumada' }] };
const sandwich = { name: 'Sandwich', sizes: [] };

describe('comboComponentVariant', () => {
  it('nombra el componente con su variante', () => {
    expect(comboComponentVariant(papas, 's-pollo')).toEqual({
      name: 'Papas TERCOS · Pollo y Miel ahumada',
      missingReason: null,
    });
  });

  it('un plato SIN variantes queda como siempre', () => {
    expect(comboComponentVariant(sandwich, null)).toEqual({ name: 'Sandwich', missingReason: null });
    expect(comboComponentVariant(sandwich, undefined)).toEqual({ name: 'Sandwich', missingReason: null });
  });

  it('un plato con variantes sin una elegida no tiene costo: lo dice', () => {
    expect(comboComponentVariant(papas, null).missingReason).toBe(
      'Falta elegir la variante de Papas TERCOS en el combo',
    );
  });

  it('una variante que el plato ya no tiene tampoco se costea', () => {
    expect(comboComponentVariant(papas, 's-borrada').missingReason).toBe(
      'La variante de "Papas TERCOS" en el combo ya no existe',
    );
  });
});
