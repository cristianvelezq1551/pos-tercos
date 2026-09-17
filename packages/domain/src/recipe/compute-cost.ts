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
      missingReasons: [`El combo "${product.name}" se costea a partir de sus componentes.`],
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
            ? `Falta el costo de "${product.name}" (sin facturas de compra confirmadas)`
            : `"${product.name}" no tiene definida la equivalencia entre la unidad de compra y la de venta.`,
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
        `"${product.name}" no tiene receta cargada y tampoco está marcado como producto de reventa.`,
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
      missing.push(`Falta el costo de "${ing.name}" (sin facturas de compra confirmadas)`);
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
export interface ComboComponentInput {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
  missingReason: string | null;
  /** Presente cuando el "componente" es un grupo a elegir costeado por su
   *  opción más cara (ver `worstCaseChoiceGroupComponent`). */
  choiceGroupLabel?: string;
}

export function computeComboCost(input: { components: ComboComponentInput[] }): {
  totalCost: number | null;
  components: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number | null;
    costContribution: number | null;
    missingReason: string | null;
    choiceGroupLabel?: string;
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
      ...(c.choiceGroupLabel !== undefined ? { choiceGroupLabel: c.choiceGroupLabel } : {}),
    };
  });
  return {
    totalCost: allKnown ? roundCost(total) : null,
    components: enriched,
    missingReasons: missing,
  };
}


/** Lo mínimo de un grupo a elegir para costearlo. */
export interface ChoiceGroupCostInput {
  id: string;
  label: string;
  quantity: number;
  options: ReadonlyArray<{ productId: string }>;
}

/**
 * El componente "peor caso" de un grupo a elegir: su opción MÁS CARA. Cuál se
 * llevará el cliente no se sabe, y suponer la barata pintaría un margen mejor
 * que el real justo donde se fija la meta de ventas. Si alguna opción no tiene
 * costo conocido, el grupo queda sin costo — nada vale $0.
 *
 * Es la ÚNICA fuente de esa regla: la usan el estado financiero, la ficha del
 * combo (`expanded-cost`) y el costo por lote de la carta. Antes vivía solo en
 * el estado financiero y la ficha prometía el peor caso sin calcularlo — el
 * combo real de producción salía $3.333 más barato de lo que puede costar.
 */
export function worstCaseChoiceGroupComponent(
  group: ChoiceGroupCostInput,
  costOf: (productId: string) => { name: string; unitCost: number | null } | undefined,
): ComboComponentInput {
  let peor: { productId: string; productName: string; unitCost: number } | null = null;
  for (const o of group.options) {
    const prod = costOf(o.productId);
    if (prod === undefined || prod.unitCost === null) {
      return {
        productId: o.productId,
        productName: prod?.name ?? group.label,
        quantity: group.quantity,
        unitCost: null,
        missingReason: `Sin costo de "${prod?.name ?? 'una opción'}" en ${group.label}`,
        choiceGroupLabel: group.label,
      };
    }
    if (!peor || prod.unitCost > peor.unitCost) {
      peor = { productId: o.productId, productName: prod.name, unitCost: prod.unitCost };
    }
  }
  return peor === null
    ? {
        productId: group.id,
        productName: group.label,
        quantity: group.quantity,
        unitCost: null,
        missingReason: `${group.label} no tiene opciones cargadas`,
        choiceGroupLabel: group.label,
      }
    : { ...peor, quantity: group.quantity, missingReason: null, choiceGroupLabel: group.label };
}
