import { expandRecipe } from '../recipe/expand-recipe';
import type { ParentRef, RecipeGraph } from '../recipe/types';

/** Tolerancia de punto flotante al comparar stock vs receta (en unitRecipe). */
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
}

/**
 * Disponibilidad del catálogo, robusta por tipo de producto. Función PURA:
 * el backend (online) y el POS (offline, con un ledger local de consumo) la
 * comparten para que el cálculo sea idéntico.
 *  - reventa directa → stock propio > 0
 *  - preparado       → insumos de su receta base alcanzan para ≥1 unidad
 *  - combo           → todos sus componentes alcanzan para ≥1 combo
 *  - "86" manual (soldOut) invalida cualquier producto
 */
export function evaluateAvailability(input: AvailabilityInput): AvailabilityResult[] {
  const { products, graph, productStock, ingredientStock } = input;
  const productById = new Map(products.map((p) => [p.id, p]));

  return products
    .filter((p) => p.isActive)
    .map((p) => {
      // 1) "86" manual gana sobre todo.
      if (p.soldOut) {
        return {
          productId: p.id,
          available: false,
          stock: p.directResale ? (productStock.get(p.id) ?? 0) : null,
          reason: 'Agotado (manual)',
        };
      }

      // 2) Reventa directa: stock propio.
      if (p.directResale) {
        const stock = productStock.get(p.id) ?? 0;
        return {
          productId: p.id,
          available: stock > 0,
          stock,
          reason: stock > 0 ? null : 'Sin stock',
        };
      }

      // 3) Combo: que alcance para armar al menos 1.
      if (p.isCombo) {
        const reason = evalComboShortages(
          p.comboComponents,
          graph,
          productById,
          ingredientStock,
          productStock,
        );
        return { productId: p.id, available: reason === null, stock: null, reason };
      }

      // 4) Preparado: insumos de la receta base.
      const reason = evalRecipeShortages(p.id, graph, ingredientStock);
      return { productId: p.id, available: reason === null, stock: null, reason };
    });
}

/**
 * Expande la receta base de un preparado y verifica que cada insumo alcance
 * para ≥1 unidad. Devuelve el motivo ("Sin Pan, Papas") o null si disponible.
 * Sin receta / receta rota → null (no se invalida; queda el "86" manual).
 */
function evalRecipeShortages(
  productId: string,
  graph: RecipeGraph,
  ingStock: Map<string, number>,
): string | null {
  const root: ParentRef = { kind: 'product', id: productId };
  let needs: ReturnType<typeof expandRecipe>;
  try {
    needs = expandRecipe(graph, root, 1);
  } catch {
    return null;
  }
  if (needs.size === 0) return null;
  const missing: string[] = [];
  for (const ing of needs.values()) {
    const have = ingStock.get(ing.ingredientId) ?? 0;
    if (have + STOCK_EPSILON < ing.totalQuantity) missing.push(ing.name);
  }
  return missing.length > 0 ? `Sin ${missing.join(', ')}` : null;
}

/**
 * Verifica que un combo pueda armarse: agrega los insumos de los componentes
 * preparados y el stock de los componentes de reventa directa, escalado por la
 * cantidad de cada componente. Devuelve el motivo o null.
 */
function evalComboShortages(
  components: ReadonlyArray<{ productId: string; quantity: number }>,
  graph: RecipeGraph,
  productById: Map<string, AvailabilityProduct>,
  ingStock: Map<string, number>,
  prodStock: Map<string, number>,
): string | null {
  const aggIngredientNeeds = new Map<string, number>();
  const ingredientName = new Map<string, string>();
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
      const needs = expandRecipe(graph, { kind: 'product', id: comp.productId }, comp.quantity);
      for (const ing of needs.values()) {
        aggIngredientNeeds.set(
          ing.ingredientId,
          (aggIngredientNeeds.get(ing.ingredientId) ?? 0) + ing.totalQuantity,
        );
        ingredientName.set(ing.ingredientId, ing.name);
      }
    } catch {
      // Receta rota de un componente: no bloqueamos por eso.
    }
  }

  const missing: string[] = [];
  for (const [pid, qty] of drNeeds) {
    if ((prodStock.get(pid) ?? 0) + STOCK_EPSILON < qty) {
      missing.push(productById.get(pid)?.name ?? 'producto');
    }
  }
  for (const [ingId, qty] of aggIngredientNeeds) {
    if ((ingStock.get(ingId) ?? 0) + STOCK_EPSILON < qty) {
      missing.push(ingredientName.get(ingId) ?? 'insumo');
    }
  }
  return missing.length > 0 ? `Sin ${[...new Set(missing)].join(', ')}` : null;
}
