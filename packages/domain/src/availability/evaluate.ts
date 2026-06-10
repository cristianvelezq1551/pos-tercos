import { expandRecipeOneLevel } from '../recipe/expand-recipe-one-level';
import type { RecipeGraph } from '../recipe/types';

/** Tolerancia de punto flotante al comparar stock vs receta. */
const STOCK_EPSILON = 1e-6;

export interface AvailabilityProduct {
  id: string;
  name: string;
  isActive: boolean;
  directResale: boolean;
  isCombo: boolean;
  soldOut: boolean;
  comboComponents: Array<{ productId: string; quantity: number }>;
}

export interface AvailabilityResult {
  productId: string;
  available: boolean;
  stock: number | null;
  reason: string | null;
}

export interface AvailabilityInput {
  products: readonly AvailabilityProduct[];
  graph: RecipeGraph;
  productStock: Map<string, number>;
  ingredientStock: Map<string, number>;
  /** Inventario de producción: stock actual por subproducto. */
  subproductStock: Map<string, number>;
}

/**
 * Disponibilidad del catálogo, robusta por tipo. Función PURA usada por
 * backend (online) y POS (offline). Modelo de inventario de producción:
 *
 *  - reventa directa  → stock propio > 0
 *  - preparado        → subproductos directos + insumos directos alcanzan
 *                        para ≥1 unidad (NO se expanden recetas anidadas)
 *  - combo            → todos sus componentes alcanzan para ≥1 combo
 *  - "86" manual (soldOut) invalida cualquier producto
 *
 * Si falta un subproducto, el mensaje dice el nombre del subproducto
 * ("Sin Pollo Apanado") en vez de los insumos profundos ("Sin pollo crudo").
 */
export function evaluateAvailability(input: AvailabilityInput): AvailabilityResult[] {
  const { products, graph, productStock, ingredientStock, subproductStock } = input;
  const productById = new Map(products.map((p) => [p.id, p]));

  return products
    .filter((p) => p.isActive)
    .map((p) => {
      if (p.soldOut) {
        return {
          productId: p.id,
          available: false,
          stock: p.directResale ? (productStock.get(p.id) ?? 0) : null,
          reason: 'Agotado (manual)',
        };
      }

      if (p.directResale) {
        const stock = productStock.get(p.id) ?? 0;
        return {
          productId: p.id,
          available: stock > 0,
          stock,
          reason: stock > 0 ? null : 'Sin stock',
        };
      }

      if (p.isCombo) {
        const reason = evalComboShortages(
          p.comboComponents,
          graph,
          productById,
          ingredientStock,
          subproductStock,
          productStock,
        );
        return { productId: p.id, available: reason === null, stock: null, reason };
      }

      // Preparado: chequear primer nivel de su receta.
      const reason = evalRecipeShortages(p.id, graph, ingredientStock, subproductStock);
      return { productId: p.id, available: reason === null, stock: null, reason };
    });
}

/**
 * Expande SOLO el primer nivel de la receta del producto preparado y verifica
 * que cada subproducto e insumo DIRECTO alcance para ≥1 unidad.
 *
 * Receta rota / vacía → null (queda el "86" manual como red de seguridad).
 */
function evalRecipeShortages(
  productId: string,
  graph: RecipeGraph,
  ingStock: Map<string, number>,
  subStock: Map<string, number>,
): string | null {
  let needs;
  try {
    needs = expandRecipeOneLevel(graph, { kind: 'product', id: productId }, 1);
  } catch {
    return null;
  }
  const missing: string[] = [];
  for (const ing of needs.ingredients.values()) {
    const have = ingStock.get(ing.ingredientId) ?? 0;
    if (have + STOCK_EPSILON < ing.totalQuantity) missing.push(ing.name);
  }
  for (const sub of needs.subproducts.values()) {
    const have = subStock.get(sub.subproductId) ?? 0;
    if (have + STOCK_EPSILON < sub.totalQuantity) missing.push(sub.name);
  }
  return missing.length > 0 ? `Sin ${[...new Set(missing)].join(', ')}` : null;
}

/**
 * Verifica que un combo pueda armarse: agrega los requerimientos de los
 * componentes (insumos directos + subproductos directos + stock de reventa)
 * escalados por cantidad. Devuelve el motivo o null.
 */
function evalComboShortages(
  components: ReadonlyArray<{ productId: string; quantity: number }>,
  graph: RecipeGraph,
  productById: Map<string, AvailabilityProduct>,
  ingStock: Map<string, number>,
  subStock: Map<string, number>,
  prodStock: Map<string, number>,
): string | null {
  const aggIng = new Map<string, number>();
  const ingName = new Map<string, string>();
  const aggSub = new Map<string, number>();
  const subName = new Map<string, string>();
  const drNeeds = new Map<string, number>();

  for (const comp of components) {
    const cp = productById.get(comp.productId);
    if (!cp) return 'Combo mal configurado';
    if (cp.soldOut) return `Sin ${cp.name}`;
    if (cp.directResale) {
      drNeeds.set(comp.productId, (drNeeds.get(comp.productId) ?? 0) + comp.quantity);
      continue;
    }
    try {
      const needs = expandRecipeOneLevel(
        graph,
        { kind: 'product', id: comp.productId },
        comp.quantity,
      );
      for (const ing of needs.ingredients.values()) {
        aggIng.set(ing.ingredientId, (aggIng.get(ing.ingredientId) ?? 0) + ing.totalQuantity);
        ingName.set(ing.ingredientId, ing.name);
      }
      for (const sub of needs.subproducts.values()) {
        aggSub.set(sub.subproductId, (aggSub.get(sub.subproductId) ?? 0) + sub.totalQuantity);
        subName.set(sub.subproductId, sub.name);
      }
    } catch {
      // Receta rota del componente: no bloqueamos por eso (el catálogo se ve igual).
    }
  }

  const missing: string[] = [];
  for (const [pid, qty] of drNeeds) {
    if ((prodStock.get(pid) ?? 0) + STOCK_EPSILON < qty) {
      missing.push(productById.get(pid)?.name ?? 'producto');
    }
  }
  for (const [ingId, qty] of aggIng) {
    if ((ingStock.get(ingId) ?? 0) + STOCK_EPSILON < qty) {
      missing.push(ingName.get(ingId) ?? 'insumo');
    }
  }
  for (const [subId, qty] of aggSub) {
    if ((subStock.get(subId) ?? 0) + STOCK_EPSILON < qty) {
      missing.push(subName.get(subId) ?? 'subproducto');
    }
  }
  return missing.length > 0 ? `Sin ${[...new Set(missing)].join(', ')}` : null;
}
