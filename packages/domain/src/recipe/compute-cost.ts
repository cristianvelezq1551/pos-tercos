import { roundCost } from '../common/money';
import { expandRecipe } from './expand-recipe';
import type { ExpandedRecipe, ParentRef, RecipeGraph } from './types';

/**
 * Mapa de costos por ingrediente: ingredientId → costo por unidad de RECETA.
 * El llamador es responsable de pre-calcular este valor desde
 * `ingredient.lastUnitCost / ingredient.conversionFactor`.
 */
export type IngredientCostMap = Map<string, number | null>;

export interface CostResult {
  /** Costo total. Null si falta información en algún input. */
  totalCost: number | null;
  /**
   * Detalle por ingrediente expandido (vacío para productos direct-resale o
   * combos cuyos componentes no usan recetas).
   */
  ingredientBreakdown: Array<{
    ingredientId: string;
    name: string;
    unitRecipe: string;
    totalQuantity: number;
    unitCostInRecipe: number | null;
    costContribution: number | null;
  }>;
  /** Lista de razones por las que el cálculo es incompleto. */
  missingReasons: string[];
}

/**
 * Costo de UN producto NO combo. Dos paths:
 *  1. directResale=true → unitCost = lastUnitCost / conversionFactor
 *  2. recipe → expandRecipe + sum (qty × ingredient.unitCost)
 *
 * Función pura: el llamador carga lastUnitCost y conversionFactor para los
 * ingredientes referenciados (vía la query SQL de costo) y los pasa via
 * IngredientCostMap.
 */
export function computeProductCost(input: {
  product: {
    id: string;
    name: string;
    directResale: boolean;
    lastUnitCost: number | null;
    conversionFactor: number | null;
    isCombo: boolean;
  };
  /** Si product tiene receta — el grafo + root para expandRecipe. Null si direct-resale. */
  recipe: { graph: RecipeGraph; root: ParentRef } | null;
  ingredientCosts: IngredientCostMap;
}): CostResult {
  const { product, recipe, ingredientCosts } = input;

  if (product.isCombo) {
    return {
      totalCost: null,
      ingredientBreakdown: [],
      missingReasons: [`Product ${product.id} is a combo — usar computeComboCost`],
    };
  }

  // Path 1: directResale
  if (product.directResale) {
    if (product.lastUnitCost === null || product.conversionFactor === null) {
      return {
        totalCost: null,
        ingredientBreakdown: [],
        missingReasons: [
          product.lastUnitCost === null
            ? `Producto "${product.name}" sin lastUnitCost (no se ha confirmado factura)`
            : `Producto "${product.name}" sin conversionFactor`,
        ],
      };
    }
    const totalCost = roundCost(product.lastUnitCost / product.conversionFactor);
    return { totalCost, ingredientBreakdown: [], missingReasons: [] };
  }

  // Path 2: recipe
  if (!recipe) {
    return {
      totalCost: null,
      ingredientBreakdown: [],
      missingReasons: [
        `Producto "${product.name}" no es direct-resale ni tiene receta cargada`,
      ],
    };
  }
  const expanded: ExpandedRecipe = expandRecipe(recipe.graph, recipe.root);

  let total = 0;
  let allKnown = true;
  const missing: string[] = [];
  const breakdown: CostResult['ingredientBreakdown'] = [];

  for (const ing of expanded.values()) {
    const unitCost = ingredientCosts.get(ing.ingredientId) ?? null;
    const contribution = unitCost !== null ? roundCost(ing.totalQuantity * unitCost) : null;
    if (unitCost === null) {
      allKnown = false;
      missing.push(`Ingrediente "${ing.name}" sin costo (lastUnitCost null)`);
    } else {
      total += contribution!;
    }
    breakdown.push({
      ingredientId: ing.ingredientId,
      name: ing.name,
      unitRecipe: ing.unitRecipe,
      totalQuantity: ing.totalQuantity,
      unitCostInRecipe: unitCost,
      costContribution: contribution,
    });
  }

  return {
    totalCost: allKnown ? roundCost(total) : null,
    ingredientBreakdown: breakdown,
    missingReasons: missing,
  };
}

/**
 * Costo de un combo: suma de quantity × unitCost de cada componente.
 * El llamador resuelve cada componente vía `computeProductCost` (que es
 * recursiva 1 nivel: combo → componentes individuales; combos anidados
 * están prohibidos por `assertComboComponentsAreNonComboProducts`).
 */
export function computeComboCost(input: {
  components: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number | null;
    missingReason: string | null;
  }>;
}): {
  totalCost: number | null;
  components: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number | null;
    costContribution: number | null;
    missingReason: string | null;
  }>;
  missingReasons: string[];
} {
  let total = 0;
  let allKnown = true;
  const missing: string[] = [];
  const enriched = input.components.map((c) => {
    const contribution = c.unitCost !== null ? roundCost(c.quantity * c.unitCost) : null;
    if (c.unitCost === null) {
      allKnown = false;
      if (c.missingReason) missing.push(c.missingReason);
    } else {
      total += contribution!;
    }
    return {
      productId: c.productId,
      productName: c.productName,
      quantity: c.quantity,
      unitCost: c.unitCost,
      costContribution: contribution,
      missingReason: c.missingReason,
    };
  });
  return {
    totalCost: allKnown ? roundCost(total) : null,
    components: enriched,
    missingReasons: missing,
  };
}

