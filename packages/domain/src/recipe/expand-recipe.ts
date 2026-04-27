import type {
  ChildRef,
  ExpandedIngredient,
  ExpandedRecipe,
  ParentRef,
  RecipeGraph,
} from './types';

const MAX_DEPTH = 32;

export class RecipeCycleError extends Error {
  constructor(public readonly cyclePath: string[]) {
    super(`Recipe cycle detected: ${cyclePath.join(' → ')}`);
    this.name = 'RecipeCycleError';
  }
}

export class RecipeMissingNodeError extends Error {
  constructor(public readonly missingId: string, public readonly kind: 'product' | 'subproduct' | 'ingredient') {
    super(`Recipe references missing ${kind} ${missingId}`);
    this.name = 'RecipeMissingNodeError';
  }
}

export class RecipeMaxDepthError extends Error {
  constructor() {
    super(`Recipe expansion exceeded max depth of ${MAX_DEPTH}`);
    this.name = 'RecipeMaxDepthError';
  }
}

/**
 * Expande recursivamente la receta del producto raíz hasta sus insumos.
 *
 * - Detecta ciclos (por ejemplo subproducto A → B → A) y lanza
 *   `RecipeCycleError` con el camino que cierra el ciclo.
 * - Aplica merma multiplicando por `1 / (1 - mermaPct)` en cada arista
 *   (cuanto más alta la merma, más insumo bruto se descuenta).
 * - Aplica `yield` al descender por subproductos: si la receta del
 *   subproducto produce N unidades por corrida, consumir 1 unidad del
 *   subproducto requiere `1/N` corridas, y por tanto `1/N` de cada
 *   insumo de la receta.
 *
 * Función pura: no hace IO. El llamador construye el `RecipeGraph` y la
 * invoca.
 *
 * @param graph Grafo completo de productos, subproductos, insumos, edges.
 * @param root  Punto de partida (producto o subproducto).
 * @param multiplier Multiplica el resultado (default 1). Útil para sumar
 *   componentes de combos.
 * @returns Map insumo_id → consumo total en la unidad de receta del insumo.
 */
export function expandRecipe(
  graph: RecipeGraph,
  root: ParentRef,
  multiplier = 1,
): ExpandedRecipe {
  const result: ExpandedRecipe = new Map();
  walk(graph, root, multiplier, [], result, 0);
  return result;
}

function walk(
  graph: RecipeGraph,
  parent: ParentRef,
  factor: number,
  visiting: ParentRef[],
  acc: ExpandedRecipe,
  depth: number,
): void {
  if (depth > MAX_DEPTH) {
    throw new RecipeMaxDepthError();
  }

  if (visiting.some((p) => p.kind === parent.kind && p.id === parent.id)) {
    const path = [...visiting, parent].map(
      (p) => `${p.kind === 'product' ? 'P' : 'S'}:${p.id}`,
    );
    throw new RecipeCycleError(path);
  }

  ensureParentExists(graph, parent);

  const key = parentKey(parent);
  const edges = graph.edgesByParent.get(key) ?? [];
  const nextVisiting = [...visiting, parent];

  for (const edge of edges) {
    const grossQty = edge.quantityNeta / (1 - edge.mermaPct);
    const childFactor = factor * grossQty;
    distributeChild(graph, edge.child, childFactor, nextVisiting, acc, depth + 1);
  }
}

function distributeChild(
  graph: RecipeGraph,
  child: ChildRef,
  amount: number,
  visiting: ParentRef[],
  acc: ExpandedRecipe,
  depth: number,
): void {
  if (child.kind === 'ingredient') {
    const ing = graph.ingredients.get(child.id);
    if (!ing) {
      throw new RecipeMissingNodeError(child.id, 'ingredient');
    }
    addIngredient(acc, ing.id, ing.name, ing.unitRecipe, amount);
    return;
  }

  // child es subproducto: descender
  const sub = graph.subproducts.get(child.id);
  if (!sub) {
    throw new RecipeMissingNodeError(child.id, 'subproduct');
  }
  if (sub.yield <= 0) {
    throw new Error(`Subproduct ${sub.id} has invalid yield ${sub.yield}`);
  }
  // Consumir `amount` unidades del subproducto requiere amount/yield corridas
  // de su receta. Multiplicamos el factor por amount/yield al recorrer.
  const childFactor = amount / sub.yield;
  walk(graph, { kind: 'subproduct', id: sub.id }, childFactor, visiting, acc, depth);
}

function addIngredient(
  acc: ExpandedRecipe,
  ingredientId: string,
  name: string,
  unitRecipe: string,
  delta: number,
): void {
  const existing = acc.get(ingredientId);
  if (existing) {
    existing.totalQuantity += delta;
    return;
  }
  const fresh: ExpandedIngredient = { ingredientId, name, unitRecipe, totalQuantity: delta };
  acc.set(ingredientId, fresh);
}

function parentKey(parent: ParentRef): string {
  return `${parent.kind === 'product' ? 'p' : 's'}:${parent.id}`;
}

function ensureParentExists(graph: RecipeGraph, parent: ParentRef): void {
  if (parent.kind === 'product' && !graph.products.has(parent.id)) {
    throw new RecipeMissingNodeError(parent.id, 'product');
  }
  if (parent.kind === 'subproduct' && !graph.subproducts.has(parent.id)) {
    throw new RecipeMissingNodeError(parent.id, 'subproduct');
  }
}
