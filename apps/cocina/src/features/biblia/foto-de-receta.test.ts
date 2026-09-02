import { describe, expect, it } from 'vitest';
import { fotoDeReceta } from './foto-de-receta';

describe('qué foto muestra la biblia', () => {
  it('la de la preparación le gana a la de la carta', () => {
    expect(fotoDeReceta({ prepImageUrl: '/armado.png', imageUrl: '/carta.png' })).toBe('/armado.png');
  });

  // Quien ya tenía fotos de producto las sigue viendo sin cargar nada nuevo.
  it('sin foto propia cae a la de la carta', () => {
    expect(fotoDeReceta({ prepImageUrl: null, imageUrl: '/carta.png' })).toBe('/carta.png');
  });

  it('sin ninguna, no hay foto', () => {
    expect(fotoDeReceta({ prepImageUrl: null, imageUrl: null })).toBeNull();
  });
});
