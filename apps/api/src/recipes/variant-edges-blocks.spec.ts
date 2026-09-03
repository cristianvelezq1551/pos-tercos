import { evaluateAvailability } from '@pos-tercos/domain';
import type { RecipeGraph } from '@pos-tercos/domain';
import { buildBlocksDefaults, variantEdgesAsProductChildren } from './recipes.service';

/**
 * La receta de un TAMAÑO no pasa por `groupEdgesByParent`: la disponibilidad
 * la inyecta cruda en el grafo. Si el flag efectivo no se resuelve al armarla,
 * una línea en "Hereda (no frena)" viaja como `undefined` —que el dominio lee
 * como bloquea— y el tamaño queda agotado por un consumible.
 *
 * Caso real (2026-09-02, producción): "Burros" no dejaba vender los tamaños
 * Pollo ni Terco con el motivo "Sin Marinado", con el subproducto Marinado
 * marcado `blocksAvailability: false` en su ficha.
 */
const MARINADO = '431c280d-a40e-47b1-91cf-2689ca73b219';
const PRODUCTO = '322f9044-6d4f-43d2-919d-47d647b28e49';

const fila = (blocksAvailability: boolean | null) =>
  ({
    id: 'edge-1',
    parentProductId: null,
    parentSubproductId: null,
    parentSizeId: 'size-pollo',
    childIngredientId: null,
    childSubproductId: MARINADO,
    quantityNeta: 100,
    mermaPct: 0,
    blocksAvailability,
    createdAt: new Date(),
  }) as unknown as Parameters<typeof variantEdgesAsProductChildren>[0][number];

const defaults = buildBlocksDefaults([], [{ id: MARINADO, blocksAvailability: false }]);

describe('variantEdgesAsProductChildren — blocksAvailability efectivo', () => {
  it('una línea que hereda toma el flag del subproducto', () => {
    expect(variantEdgesAsProductChildren([fila(null)], PRODUCTO, defaults)[0]).toMatchObject({
      blocksAvailability: false,
    });
  });

  it('el override de la línea le gana a la ficha', () => {
    expect(variantEdgesAsProductChildren([fila(true)], PRODUCTO, defaults)[0]).toMatchObject({
      blocksAvailability: true,
    });
  });

  it('con null queda sin resolver: lo hace groupEdgesByParent', () => {
    expect(
      variantEdgesAsProductChildren([fila(null)], PRODUCTO, null)[0].blocksAvailability,
    ).toBeUndefined();
  });
});

describe('disponibilidad de un tamaño con un consumible sin stock', () => {
  const grafo: RecipeGraph = {
    products: new Map([[PRODUCTO, { id: PRODUCTO, name: 'Burros' }]]),
    subproducts: new Map([[MARINADO, { id: MARINADO, name: 'Marinado', yield: 1 }]]),
    ingredients: new Map(),
    edgesByParent: new Map(),
  };

  const evaluar = (edges: ReturnType<typeof variantEdgesAsProductChildren>) =>
    evaluateAvailability({
      products: [
        {
          id: PRODUCTO,
          name: 'Burros',
          isActive: true,
          directResale: false,
          isCombo: false,
          soldOut: false,
          forceAvailable: false,
          comboComponents: [],
          variants: [{ sizeId: 'size-pollo', name: 'Pollo', edges }],
        },
      ],
      graph: grafo,
      productStock: new Map(),
      ingredientStock: new Map(),
      subproductStock: new Map([[MARINADO, -200]]),
    })[0].variants[0];

  it('no frena la venta cuando el subproducto es consumible', () => {
    expect(evaluar(variantEdgesAsProductChildren([fila(null)], PRODUCTO, defaults))).toMatchObject({
      available: true,
      reason: null,
    });
  });

  it('sí frena cuando el subproducto es bloqueante', () => {
    const bloqueantes = buildBlocksDefaults([], [{ id: MARINADO, blocksAvailability: true }]);
    expect(evaluar(variantEdgesAsProductChildren([fila(null)], PRODUCTO, bloqueantes))).toMatchObject({
      available: false,
      reason: 'Sin Marinado',
    });
  });
});
