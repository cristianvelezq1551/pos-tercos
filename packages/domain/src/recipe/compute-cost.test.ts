import { describe, expect, it } from 'vitest';
import { computeComboCost, computeProductCost, type IngredientCostMap } from './compute-cost';
import type { ParentRef, RecipeEdgeNode, RecipeGraph } from './types';

function recipeGraph(edges: Array<{ ingId: string; qty: number; merma?: number }>): {
  graph: RecipeGraph;
  root: ParentRef;
} {
  const root: ParentRef = { kind: 'product', id: 'prod' };
  const edgeNodes: RecipeEdgeNode[] = edges.map((e) => ({
    parent: root,
    child: { kind: 'ingredient', id: e.ingId },
    quantityNeta: e.qty,
    mermaPct: e.merma ?? 0,
  }));
  return {
    graph: {
      products: new Map([['prod', { id: 'prod', name: 'Producto' }]]),
      subproducts: new Map(),
      ingredients: new Map(
        edges.map((e) => [e.ingId, { id: e.ingId, name: e.ingId, unitRecipe: 'g' }]),
      ),
      edgesByParent: new Map([['p:prod', edgeNodes]]),
    },
    root,
  };
}

const baseProduct = {
  id: 'prod',
  name: 'Producto',
  directResale: false,
  lastUnitCost: null as number | null,
  conversionFactor: null as number | null,
  isCombo: false,
};

describe('computeProductCost', () => {
  it('directResale: costo = lastUnitCost / conversionFactor', () => {
    const result = computeProductCost({
      product: { ...baseProduct, directResale: true, lastUnitCost: 36000, conversionFactor: 24 },
      recipe: null,
      ingredientCosts: new Map(),
    });
    expect(result.totalCost).toBe(1500);
    expect(result.missingReasons).toEqual([]);
  });

  it('directResale sin lastUnitCost → null con razón explícita', () => {
    const result = computeProductCost({
      product: { ...baseProduct, directResale: true, conversionFactor: 24 },
      recipe: null,
      ingredientCosts: new Map(),
    });
    expect(result.totalCost).toBeNull();
    expect(result.missingReasons[0]).toMatch(/sin lastUnitCost/);
  });

  it('directResale sin conversionFactor → null con razón explícita', () => {
    const result = computeProductCost({
      product: { ...baseProduct, directResale: true, lastUnitCost: 36000 },
      recipe: null,
      ingredientCosts: new Map(),
    });
    expect(result.totalCost).toBeNull();
    expect(result.missingReasons[0]).toMatch(/sin conversionFactor/);
  });

  it('combo → null y deriva a computeComboCost', () => {
    const result = computeProductCost({
      product: { ...baseProduct, isCombo: true },
      recipe: null,
      ingredientCosts: new Map(),
    });
    expect(result.totalCost).toBeNull();
    expect(result.missingReasons[0]).toMatch(/combo/);
  });

  it('receta: total = Σ cantidad expandida × costo unitario (con merma)', () => {
    const { graph, root } = recipeGraph([
      { ingId: 'carne', qty: 150, merma: 0.25 }, // bruto 200g
      { ingId: 'pan', qty: 1 },
    ]);
    const costs: IngredientCostMap = new Map([
      ['carne', 30], // $/g
      ['pan', 500], // $/unidad
    ]);
    const result = computeProductCost({
      product: baseProduct,
      recipe: { graph, root },
      ingredientCosts: costs,
    });
    // 200×30 + 1×500 = 6500
    expect(result.totalCost).toBe(6500);
    expect(result.ingredientBreakdown).toHaveLength(2);
    const carne = result.ingredientBreakdown.find((b) => b.ingredientId === 'carne');
    expect(carne?.costContribution).toBe(6000);
  });

  it('receta con un insumo sin costo → totalCost null pero breakdown completo', () => {
    const { graph, root } = recipeGraph([
      { ingId: 'carne', qty: 100 },
      { ingId: 'pan', qty: 1 },
    ]);
    const costs: IngredientCostMap = new Map([
      ['carne', 30],
      ['pan', null],
    ]);
    const result = computeProductCost({
      product: baseProduct,
      recipe: { graph, root },
      ingredientCosts: costs,
    });
    expect(result.totalCost).toBeNull();
    expect(result.missingReasons[0]).toMatch(/"pan" sin costo/);
    // El breakdown conserva lo que SÍ se sabe.
    const carne = result.ingredientBreakdown.find((b) => b.ingredientId === 'carne');
    expect(carne?.costContribution).toBe(3000);
    const pan = result.ingredientBreakdown.find((b) => b.ingredientId === 'pan');
    expect(pan?.costContribution).toBeNull();
  });

  it('insumo ausente del cost map equivale a costo null', () => {
    const { graph, root } = recipeGraph([{ ingId: 'carne', qty: 100 }]);
    const result = computeProductCost({
      product: baseProduct,
      recipe: { graph, root },
      ingredientCosts: new Map(),
    });
    expect(result.totalCost).toBeNull();
  });

  it('sin receta y sin directResale → null con razón', () => {
    const result = computeProductCost({
      product: baseProduct,
      recipe: null,
      ingredientCosts: new Map(),
    });
    expect(result.totalCost).toBeNull();
    expect(result.missingReasons[0]).toMatch(/ni tiene receta/);
  });

  it('redondea a 4 decimales', () => {
    const result = computeProductCost({
      product: { ...baseProduct, directResale: true, lastUnitCost: 1000, conversionFactor: 3 },
      recipe: null,
      ingredientCosts: new Map(),
    });
    expect(result.totalCost).toBe(333.3333);
  });
});

describe('computeComboCost', () => {
  it('suma quantity × unitCost de cada componente', () => {
    const result = computeComboCost({
      components: [
        { productId: 'a', productName: 'Burger', quantity: 2, unitCost: 5000, missingReason: null },
        { productId: 'b', productName: 'Gaseosa', quantity: 1, unitCost: 1500, missingReason: null },
      ],
    });
    expect(result.totalCost).toBe(11500);
    expect(result.components[0].costContribution).toBe(10000);
  });

  it('un componente sin costo → totalCost null y propaga la razón', () => {
    const result = computeComboCost({
      components: [
        { productId: 'a', productName: 'Burger', quantity: 1, unitCost: 5000, missingReason: null },
        {
          productId: 'b',
          productName: 'Gaseosa',
          quantity: 1,
          unitCost: null,
          missingReason: 'Gaseosa sin factura confirmada',
        },
      ],
    });
    expect(result.totalCost).toBeNull();
    expect(result.missingReasons).toEqual(['Gaseosa sin factura confirmada']);
    expect(result.components[1].costContribution).toBeNull();
  });

  it('combo vacío cuesta 0 (caso degenerado, no rompe)', () => {
    const result = computeComboCost({ components: [] });
    expect(result.totalCost).toBe(0);
  });
});
