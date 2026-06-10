import type {
  IngredientNode,
  ProductNode,
  RecipeEdgeNode,
  RecipeGraph,
  SubproductNode,
} from '../recipe/types';
import type { AvailabilityProduct } from './evaluate';

/** RecipeGraph en forma JSON-serializable (Maps → arrays). */
export interface SerializedRecipeGraph {
  products: ProductNode[];
  subproducts: SubproductNode[];
  ingredients: IngredientNode[];
  edgesByParent: Array<[string, RecipeEdgeNode[]]>;
}

/**
 * Snapshot para calcular disponibilidad OFFLINE (B.2.2): el backend lo expone
 * en `GET /products/offline-snapshot`, el POS lo cachea y, con un ledger local
 * de consumo, recalcula disponibilidad con `evaluateAvailability`.
 */
export interface OfflineAvailabilitySnapshot {
  products: AvailabilityProduct[];
  graph: SerializedRecipeGraph;
  productStock: Record<string, number>;
  ingredientStock: Record<string, number>;
  /** Stock de subproductos (inventario de producción). */
  subproductStock: Record<string, number>;
  asOf: string;
}

export function serializeRecipeGraph(graph: RecipeGraph): SerializedRecipeGraph {
  return {
    products: [...graph.products.values()],
    subproducts: [...graph.subproducts.values()],
    ingredients: [...graph.ingredients.values()],
    edgesByParent: [...graph.edgesByParent.entries()],
  };
}

export function deserializeRecipeGraph(s: SerializedRecipeGraph): RecipeGraph {
  return {
    products: new Map(s.products.map((p) => [p.id, p])),
    subproducts: new Map(s.subproducts.map((p) => [p.id, p])),
    ingredients: new Map(s.ingredients.map((p) => [p.id, p])),
    edgesByParent: new Map(s.edgesByParent),
  };
}
