import { expandRecipeOneLevel } from '../recipe/expand-recipe-one-level';
import type { RecipeEdgeNode, RecipeGraph } from '../recipe/types';

/** Tolerancia de punto flotante al comparar stock vs receta. */
const STOCK_EPSILON = 1e-6;

/**
 * Una variante del producto, con la receta que SUMA sobre la base.
 *
 * Sin esto, la disponibilidad miraba solo la receta base: el día que se acaba
 * la proteína, la caja y la web siguen ofreciendo el plato y el cobro falla
 * con el cliente enfrente. `edges` vacío = esa variante no agrega nada, así que
 * se puede hacer siempre que la base alcance.
 */
export interface AvailabilityVariant {
  sizeId: string;
  name: string;
  edges: RecipeEdgeNode[];
}

export interface AvailabilityProduct {
  id: string;
  name: string;
  isActive: boolean;
  directResale: boolean;
  isCombo: boolean;
  soldOut: boolean;
  /** Forzado disponible por el dueño: pisa el cómputo de stock. */
  forceAvailable: boolean;
  comboComponents: Array<{ productId: string; quantity: number }>;
  /** Variantes del producto. Ausente o vacío = no tiene. */
  variants?: AvailabilityVariant[];
}

export interface AvailabilityVariantResult {
  sizeId: string;
  name: string;
  available: boolean;
  reason: string | null;
}

export interface AvailabilityResult {
  productId: string;
  available: boolean;
  stock: number | null;
  reason: string | null;
  /**
   * Disponibilidad de cada variante. Vacío si el producto no tiene.
   * El plato se ofrece si AL MENOS UNA se puede hacer; las que no, se
   * deshabilitan en el selector en vez de esconder el plato entero.
   */
  variants: AvailabilityVariantResult[];
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
 *  - "forzar disponible" (forceAvailable) lo deja vendible pese al stock
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
          variants: [],
        };
      }

      // Forzado disponible: el dueño lo vende aunque el stock no alcance en el
      // sistema. Pisa el cómputo por tipo (no bloquea por faltantes).
      if (p.forceAvailable) {
        return {
          productId: p.id,
          available: true,
          stock: p.directResale ? (productStock.get(p.id) ?? 0) : null,
          reason: null,
          variants: [],
        };
      }

      if (p.directResale) {
        const stock = productStock.get(p.id) ?? 0;
        return {
          productId: p.id,
          available: stock > 0,
          stock,
          reason: stock > 0 ? null : 'Sin stock',
          variants: [],
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
        return { productId: p.id, available: reason === null, stock: null, reason, variants: [] };
      }

      // Preparado. Sin variantes es el chequeo de siempre; con variantes, cada
      // una se evalúa con la receta base MÁS la suya, y el plato se ofrece si
      // al menos una se puede hacer.
      const variantes = p.variants ?? [];
      if (variantes.length === 0) {
        const reason = evalRecipeShortages(p.id, graph, ingredientStock, subproductStock);
        return { productId: p.id, available: reason === null, stock: null, reason, variants: [] };
      }

      const evaluadas: AvailabilityVariantResult[] = variantes.map((v) => {
        const reason = evalRecipeShortages(
          p.id,
          v.edges.length === 0 ? graph : withVariantEdges(graph, p.id, v.edges),
          ingredientStock,
          subproductStock,
        );
        return { sizeId: v.sizeId, name: v.name, available: reason === null, reason };
      });
      const alguna = evaluadas.some((v) => v.available);
      return {
        productId: p.id,
        available: alguna,
        stock: null,
        // Si ninguna se puede hacer, el motivo es todo lo que falta —
        // decir solo lo de la primera dejaría al dueño reponiendo a ciegas.
        reason: alguna ? null : unirMotivos(evaluadas),
        variants: evaluadas,
      };
    });
}

/**
 * El grafo con las aristas de la variante colgadas del producto, SIN tocar el
 * original: `evaluateAvailability` es pura y la usan a la vez el backend y la
 * caja sin conexión.
 */
function withVariantEdges(
  graph: RecipeGraph,
  productId: string,
  edges: RecipeEdgeNode[],
): RecipeGraph {
  const clave = `p:${productId}`;
  const copia = new Map(graph.edgesByParent);
  copia.set(clave, [...(graph.edgesByParent.get(clave) ?? []), ...edges]);
  return { ...graph, edgesByParent: copia };
}

/** «Sin X, Y» con lo que falta en TODAS las variantes, sin repetir. */
function unirMotivos(variantes: readonly AvailabilityVariantResult[]): string | null {
  const faltantes = new Set<string>();
  for (const v of variantes) {
    if (!v.reason) continue;
    for (const nombre of v.reason.replace(/^Sin /, '').split(', ')) faltantes.add(nombre);
  }
  return faltantes.size > 0 ? `Sin ${[...faltantes].join(', ')}` : null;
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
    // Consumible (servilletas, sal): se descuenta y se costea, pero NO frena
    // la venta. El único filtro de no-bloqueantes de todo el sistema vive acá.
    if (!ing.blocksAvailability) continue;
    const have = ingStock.get(ing.ingredientId) ?? 0;
    if (have + STOCK_EPSILON < ing.totalQuantity) missing.push(ing.name);
  }
  for (const sub of needs.subproducts.values()) {
    if (!sub.blocksAvailability) continue;
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
    // Componente forzado disponible → no bloquea el combo por su stock.
    if (cp.forceAvailable) continue;
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
        // Consumible: no frena el combo (mismo criterio que el preparado suelto).
        if (!ing.blocksAvailability) continue;
        aggIng.set(ing.ingredientId, (aggIng.get(ing.ingredientId) ?? 0) + ing.totalQuantity);
        ingName.set(ing.ingredientId, ing.name);
      }
      for (const sub of needs.subproducts.values()) {
        if (!sub.blocksAvailability) continue;
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
