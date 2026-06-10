import { describe, expect, it } from 'vitest';
import {
  expandRecipe,
  RecipeCycleError,
  RecipeMaxDepthError,
  RecipeMissingNodeError,
} from './expand-recipe';
import { expandRecipeOneLevel } from './expand-recipe-one-level';
import type {
  IngredientNode,
  ParentRef,
  RecipeEdgeNode,
  RecipeGraph,
  SubproductNode,
} from './types';

function ing(id: string, name = id): IngredientNode {
  return { id, name, unitRecipe: 'g' };
}

function sub(id: string, yieldQty: number, name = id): SubproductNode {
  return { id, name, yield: yieldQty };
}

function edge(
  parent: ParentRef,
  child: { kind: 'ingredient' | 'subproduct'; id: string },
  quantityNeta: number,
  mermaPct = 0,
): RecipeEdgeNode {
  return { parent, child, quantityNeta, mermaPct };
}

function buildGraph(opts: {
  products?: string[];
  subproducts?: SubproductNode[];
  ingredients?: IngredientNode[];
  edges?: RecipeEdgeNode[];
}): RecipeGraph {
  const edgesByParent = new Map<string, RecipeEdgeNode[]>();
  for (const e of opts.edges ?? []) {
    const key = `${e.parent.kind === 'product' ? 'p' : 's'}:${e.parent.id}`;
    const list = edgesByParent.get(key) ?? [];
    list.push(e);
    edgesByParent.set(key, list);
  }
  return {
    products: new Map((opts.products ?? []).map((id) => [id, { id, name: id }])),
    subproducts: new Map((opts.subproducts ?? []).map((s) => [s.id, s])),
    ingredients: new Map((opts.ingredients ?? []).map((i) => [i.id, i])),
    edgesByParent,
  };
}

const P = (id: string): ParentRef => ({ kind: 'product', id });
const S = (id: string): ParentRef => ({ kind: 'subproduct', id });

describe('expandRecipe', () => {
  it('expande insumos directos sin merma', () => {
    const graph = buildGraph({
      products: ['burger'],
      ingredients: [ing('pan'), ing('carne')],
      edges: [
        edge(P('burger'), { kind: 'ingredient', id: 'pan' }, 1),
        edge(P('burger'), { kind: 'ingredient', id: 'carne' }, 150),
      ],
    });
    const result = expandRecipe(graph, P('burger'));
    expect(result.get('pan')?.totalQuantity).toBe(1);
    expect(result.get('carne')?.totalQuantity).toBe(150);
    expect(result.size).toBe(2);
  });

  it('aplica merma: 150g neto con 25% merma = 200g bruto', () => {
    const graph = buildGraph({
      products: ['burger'],
      ingredients: [ing('carne')],
      edges: [edge(P('burger'), { kind: 'ingredient', id: 'carne' }, 150, 0.25)],
    });
    const result = expandRecipe(graph, P('burger'));
    expect(result.get('carne')?.totalQuantity).toBeCloseTo(200);
  });

  it('desciende por subproducto aplicando yield: 2 uds de salsa (yield 10) consumen 1/5 de la receta', () => {
    const graph = buildGraph({
      products: ['burger'],
      subproducts: [sub('salsa', 10)],
      ingredients: [ing('tomate')],
      edges: [
        edge(P('burger'), { kind: 'subproduct', id: 'salsa' }, 2),
        edge(S('salsa'), { kind: 'ingredient', id: 'tomate' }, 1000),
      ],
    });
    const result = expandRecipe(graph, P('burger'));
    // 2 uds salsa / yield 10 = 0.2 corridas × 1000g tomate = 200g
    expect(result.get('tomate')?.totalQuantity).toBeCloseTo(200);
  });

  it('anida subproductos (2 niveles) componiendo yields y mermas', () => {
    const graph = buildGraph({
      products: ['plato'],
      subproducts: [sub('salsa', 4), sub('base', 2)],
      ingredients: [ing('cebolla')],
      edges: [
        edge(P('plato'), { kind: 'subproduct', id: 'salsa' }, 1),
        edge(S('salsa'), { kind: 'subproduct', id: 'base' }, 2, 0.5),
        edge(S('base'), { kind: 'ingredient', id: 'cebolla' }, 100),
      ],
    });
    const result = expandRecipe(graph, P('plato'));
    // 1 salsa = 1/4 corrida → necesita 2/(1-0.5)=4 base por corrida → 1 base
    // 1 base = 1/2 corrida → 50g cebolla
    expect(result.get('cebolla')?.totalQuantity).toBeCloseTo(50);
  });

  it('agrega el mismo insumo llegando por caminos distintos', () => {
    const graph = buildGraph({
      products: ['burger'],
      subproducts: [sub('salsa', 1)],
      ingredients: [ing('sal')],
      edges: [
        edge(P('burger'), { kind: 'ingredient', id: 'sal' }, 5),
        edge(P('burger'), { kind: 'subproduct', id: 'salsa' }, 1),
        edge(S('salsa'), { kind: 'ingredient', id: 'sal' }, 3),
      ],
    });
    const result = expandRecipe(graph, P('burger'));
    expect(result.get('sal')?.totalQuantity).toBeCloseTo(8);
  });

  it('multiplier escala todo el resultado (componentes de combo)', () => {
    const graph = buildGraph({
      products: ['burger'],
      ingredients: [ing('carne')],
      edges: [edge(P('burger'), { kind: 'ingredient', id: 'carne' }, 150)],
    });
    const result = expandRecipe(graph, P('burger'), 3);
    expect(result.get('carne')?.totalQuantity).toBe(450);
  });

  it('receta vacía devuelve mapa vacío', () => {
    const graph = buildGraph({ products: ['solo'] });
    expect(expandRecipe(graph, P('solo')).size).toBe(0);
  });

  it('detecta ciclo entre subproductos (A → B → A)', () => {
    const graph = buildGraph({
      products: ['plato'],
      subproducts: [sub('a', 1), sub('b', 1)],
      edges: [
        edge(P('plato'), { kind: 'subproduct', id: 'a' }, 1),
        edge(S('a'), { kind: 'subproduct', id: 'b' }, 1),
        edge(S('b'), { kind: 'subproduct', id: 'a' }, 1),
      ],
    });
    expect(() => expandRecipe(graph, P('plato'))).toThrow(RecipeCycleError);
  });

  it('corta cadenas más profundas que MAX_DEPTH', () => {
    const CHAIN = 40;
    const subs = Array.from({ length: CHAIN }, (_, i) => sub(`s${i}`, 1));
    const edges: RecipeEdgeNode[] = [edge(P('plato'), { kind: 'subproduct', id: 's0' }, 1)];
    for (let i = 0; i < CHAIN - 1; i++) {
      edges.push(edge(S(`s${i}`), { kind: 'subproduct', id: `s${i + 1}` }, 1));
    }
    const graph = buildGraph({ products: ['plato'], subproducts: subs, edges });
    expect(() => expandRecipe(graph, P('plato'))).toThrow(RecipeMaxDepthError);
  });

  it('lanza RecipeMissingNodeError si el root no está en el grafo', () => {
    const graph = buildGraph({ products: ['otro'] });
    expect(() => expandRecipe(graph, P('fantasma'))).toThrow(RecipeMissingNodeError);
  });

  it('lanza RecipeMissingNodeError si una edge apunta a un insumo inexistente', () => {
    const graph = buildGraph({
      products: ['burger'],
      edges: [edge(P('burger'), { kind: 'ingredient', id: 'no-existe' }, 1)],
    });
    expect(() => expandRecipe(graph, P('burger'))).toThrow(RecipeMissingNodeError);
  });

  it('rechaza subproducto con yield <= 0', () => {
    const graph = buildGraph({
      products: ['plato'],
      subproducts: [sub('roto', 0)],
      edges: [edge(P('plato'), { kind: 'subproduct', id: 'roto' }, 1)],
    });
    expect(() => expandRecipe(graph, P('plato'))).toThrow(/invalid yield/);
  });
});

describe('expandRecipeOneLevel', () => {
  it('NO desciende por subproductos: devuelve consumo del subproducto, no de sus insumos', () => {
    const graph = buildGraph({
      products: ['burger'],
      subproducts: [sub('salsa', 10)],
      ingredients: [ing('pan'), ing('tomate')],
      edges: [
        edge(P('burger'), { kind: 'ingredient', id: 'pan' }, 1),
        edge(P('burger'), { kind: 'subproduct', id: 'salsa' }, 2),
        edge(S('salsa'), { kind: 'ingredient', id: 'tomate' }, 1000),
      ],
    });
    const result = expandRecipeOneLevel(graph, P('burger'));
    expect(result.ingredients.get('pan')?.totalQuantity).toBe(1);
    expect(result.subproducts.get('salsa')?.totalQuantity).toBe(2);
    // El tomate es del segundo nivel: no aparece.
    expect(result.ingredients.has('tomate')).toBe(false);
  });

  it('aplica merma en el primer nivel', () => {
    const graph = buildGraph({
      products: ['burger'],
      ingredients: [ing('carne')],
      edges: [edge(P('burger'), { kind: 'ingredient', id: 'carne' }, 150, 0.25)],
    });
    const result = expandRecipeOneLevel(graph, P('burger'));
    expect(result.ingredients.get('carne')?.totalQuantity).toBeCloseTo(200);
  });

  it('multiplier escala insumos y subproductos', () => {
    const graph = buildGraph({
      products: ['burger'],
      subproducts: [sub('salsa', 10)],
      ingredients: [ing('pan')],
      edges: [
        edge(P('burger'), { kind: 'ingredient', id: 'pan' }, 1),
        edge(P('burger'), { kind: 'subproduct', id: 'salsa' }, 2),
      ],
    });
    const result = expandRecipeOneLevel(graph, P('burger'), 5);
    expect(result.ingredients.get('pan')?.totalQuantity).toBe(5);
    expect(result.subproducts.get('salsa')?.totalQuantity).toBe(10);
  });

  it('agrega edges duplicadas del mismo child', () => {
    const graph = buildGraph({
      products: ['burger'],
      ingredients: [ing('queso')],
      edges: [
        edge(P('burger'), { kind: 'ingredient', id: 'queso' }, 20),
        edge(P('burger'), { kind: 'ingredient', id: 'queso' }, 10),
      ],
    });
    const result = expandRecipeOneLevel(graph, P('burger'));
    expect(result.ingredients.get('queso')?.totalQuantity).toBe(30);
  });

  it('expande recetas de subproductos (parent kind subproduct) para producción', () => {
    const graph = buildGraph({
      subproducts: [sub('salsa', 10)],
      ingredients: [ing('tomate')],
      edges: [edge(S('salsa'), { kind: 'ingredient', id: 'tomate' }, 1000, 0.2)],
    });
    const result = expandRecipeOneLevel(graph, S('salsa'));
    expect(result.ingredients.get('tomate')?.totalQuantity).toBeCloseTo(1250);
  });

  it('lanza RecipeMissingNodeError si el root no existe', () => {
    const graph = buildGraph({});
    expect(() => expandRecipeOneLevel(graph, P('fantasma'))).toThrow(RecipeMissingNodeError);
  });
});
