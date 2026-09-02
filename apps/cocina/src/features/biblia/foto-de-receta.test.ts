import { describe, expect, it } from 'vitest';
import { fotoPrincipal, fotosDeReceta } from './foto-de-receta';

const carta = '/carta.png';

describe('qué fotos muestra la biblia', () => {
  it('las de la preparación le ganan a la de la carta', () => {
    const fotos = fotosDeReceta({
      prepImages: [{ url: '/armado.png', label: 'Sencilla' }],
      imageUrl: carta,
    });
    expect(fotos).toEqual([{ url: '/armado.png', label: 'Sencilla' }]);
  });

  // El pedido: una foto por variante, en el orden en que se cargaron.
  it('muestra todas las variantes, con su rótulo', () => {
    const fotos = fotosDeReceta({
      prepImages: [
        { url: '/sencilla.png', label: 'Sencilla' },
        { url: '/doble.png', label: 'Doble' },
      ],
      imageUrl: carta,
    });
    expect(fotos.map((f) => f.label)).toEqual(['Sencilla', 'Doble']);
  });

  // Quien ya tenía fotos de producto las sigue viendo sin cargar nada nuevo.
  it('sin fotos propias cae a la de la carta, sin rótulo', () => {
    expect(fotosDeReceta({ prepImages: [], imageUrl: carta })).toEqual([
      { url: carta, label: null },
    ]);
  });

  it('sin ninguna, no hay fotos', () => {
    expect(fotosDeReceta({ prepImages: [], imageUrl: null })).toEqual([]);
  });
});

describe('la foto que representa la ficha en la lista', () => {
  it('es la primera de la preparación', () => {
    expect(
      fotoPrincipal({
        prepImages: [
          { url: '/a.png', label: null },
          { url: '/b.png', label: null },
        ],
        imageUrl: carta,
      }),
    ).toBe('/a.png');
  });

  it('es null cuando no hay ninguna', () => {
    expect(fotoPrincipal({ prepImages: [], imageUrl: null })).toBeNull();
  });
});
