import type { ChildRef, ParentRef, RecipeEdgeNode, RecipeGraph } from './types';
import { grossQuantity, RecipeMissingNodeError } from './expand-recipe';

/**
 * Resultado del expand de UN NIVEL: cuánto consume el parent root de cada
 * subproducto y de cada insumo DIRECTOS (sin descender por las recetas de
 * los subproductos).
 *
 * Modelo de inventario de producción:
 *   - Los subproductos son stockables. Vender un producto que los usa
 *     descuenta del subproducto directamente, NO de los insumos profundos.
 *   - Los insumos directos del producto sí se descuentan normal.
 *   - Producir un subproducto consume insumos según ESA receta (también
 *     usando esta función, pasada con `kind: 'subproduct'`).
 */
export interface ExpandedRecipeOneLevel {
  /** ingredientId → totalQuantity (en unidad de receta del insumo). */
  ingredients: Map<string, ExpandedIngredientOneLevel>;
  /** subproductId → totalQuantity (en unidad de stock del subproducto). */
  subproducts: Map<string, ExpandedSubproductOneLevel>;
}

export interface ExpandedIngredientOneLevel {
  ingredientId: string;
  name: string;
  unitRecipe: string;
  totalQuantity: number;
  /** Ver `blocksAvailability` abajo. */
  blocksAvailability: boolean;
}

export interface ExpandedSubproductOneLevel {
  subproductId: string;
  name: string;
  unit: string;
  totalQuantity: number;
  /** Ver `blocksAvailability` abajo. */
  blocksAvailability: boolean;
}

/**
 * Expande SOLO el primer nivel de la receta del parent root. Devuelve
 * cuánto consumir de cada subproducto e insumo directos para producir
 * `multiplier` unidades del parent.
 *
 * - Aplica merma: `cantidadBruta = quantityNeta / (1 - mermaPct)`.
 * - NO desciende por subproductos: el llamador es responsable de pedir la
 *   expansión de las recetas de subproductos por separado cuando quiera
 *   producirlos.
 * - Función pura, sin IO.
 *
 * ⚠️ REGLA DURA — `blocksAvailability` se ANOTA, NUNCA se filtra acá. Esta
 * función alimenta DOS caminos: la disponibilidad (que sí ignora los
 * no-bloqueantes) y el CONSUMO/COSTEO (que los descuenta y costea como a
 * cualquier otro). Filtrar acá dejaría de descontar las servilletas y su costo
 * desaparecería del COGS. El filtro vive solo en `evaluateAvailability`.
 *
 * @param graph Grafo (necesita products+subproducts+ingredients+edges del root)
 * @param root  Parent (producto o subproducto) a expandir
 * @param multiplier Cuántas unidades del parent se van a producir/vender (default 1)
 */
export function expandRecipeOneLevel(
  graph: RecipeGraph,
  root: ParentRef,
  multiplier = 1,
): ExpandedRecipeOneLevel {
  ensureParentExists(graph, root);
  const out: ExpandedRecipeOneLevel = {
    ingredients: new Map(),
    subproducts: new Map(),
  };
  const edges = graph.edgesByParent.get(parentKey(root)) ?? [];
  for (const edge of edges) {
    const grossQty = grossQuantity(edge.quantityNeta, edge.mermaPct);
    const amount = grossQty * multiplier;
    // Solo un `false` explícito libera (undefined = bloquea, ver types.ts).
    addChild(graph, edge.child, amount, edge.blocksAvailability !== false, out);
  }
  return out;
}

function addChild(
  graph: RecipeGraph,
  child: ChildRef,
  amount: number,
  blocks: boolean,
  out: ExpandedRecipeOneLevel,
): void {
  if (child.kind === 'ingredient') {
    const ing = graph.ingredients.get(child.id);
    if (!ing) throw new RecipeMissingNodeError(child.id, 'ingredient');
    const existing = out.ingredients.get(ing.id);
    if (existing) {
      existing.totalQuantity += amount;
      // Mismo child por dos edges con flags distintos: gana el bloqueante
      // (conservador — si en alguna línea es crítico, frena).
      existing.blocksAvailability = existing.blocksAvailability || blocks;
    } else {
      out.ingredients.set(ing.id, {
        ingredientId: ing.id,
        name: ing.name,
        unitRecipe: ing.unitRecipe,
        totalQuantity: amount,
        blocksAvailability: blocks,
      });
    }
    return;
  }
  const sub = graph.subproducts.get(child.id);
  if (!sub) throw new RecipeMissingNodeError(child.id, 'subproduct');
  // En el modelo de "inventario de producción" 1 unidad del child-subproducto
  // = 1 unidad de stock (el yield se aplicó al producirlo, no al consumirlo).
  // `amount` ya viene en unidades del subproducto porque la edge dice
  // "para 1 producto consumo N unidades del subproducto".
  const existing = out.subproducts.get(sub.id);
  if (existing) {
    existing.totalQuantity += amount;
    existing.blocksAvailability = existing.blocksAvailability || blocks;
  } else {
    out.subproducts.set(sub.id, {
      subproductId: sub.id,
      name: sub.name,
      // El unit del subproducto no está en SubproductNode (solo yield/name).
      // El backend re-resuelve la unit por lookup propio cuando lo necesita.
      unit: '',
      totalQuantity: amount,
      blocksAvailability: blocks,
    });
  }
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

/** Re-export para conveniencia de llamadores. */
export type { RecipeEdgeNode };
