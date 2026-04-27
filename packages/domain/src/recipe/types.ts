/**
 * Tipos del grafo de receta usado por `expandRecipe`.
 *
 * Los servicios de la API construyen un `RecipeGraph` cargando desde DB
 * todos los nodos relevantes (producto raíz + subproductos transitivos +
 * insumos referenciados) en pocas queries, y luego invocan la función pura.
 */

export interface IngredientNode {
  id: string;
  name: string;
  unitRecipe: string;
}

export interface SubproductNode {
  id: string;
  name: string;
  /** Cuántas unidades del subproducto produce 1 corrida de su receta. */
  yield: number;
}

export interface ProductNode {
  id: string;
  name: string;
}

export type ChildRef =
  | { kind: 'ingredient'; id: string }
  | { kind: 'subproduct'; id: string };

export type ParentRef =
  | { kind: 'product'; id: string }
  | { kind: 'subproduct'; id: string };

export interface RecipeEdgeNode {
  parent: ParentRef;
  child: ChildRef;
  /**
   * Cantidad NETA consumida del child (en la unidad de receta del child)
   * para producir 1 unidad del parent. La cantidad bruta a descontar de
   * stock es `quantityNeta / (1 - mermaPct)`.
   */
  quantityNeta: number;
  /** Pérdida proporcional esperada en el proceso. Rango: [0, 1). */
  mermaPct: number;
}

export interface RecipeGraph {
  products: Map<string, ProductNode>;
  subproducts: Map<string, SubproductNode>;
  ingredients: Map<string, IngredientNode>;
  /** Edges agrupadas por parent (prefijo `p:` o `s:` + id). */
  edgesByParent: Map<string, RecipeEdgeNode[]>;
}

/** Resultado del expand: cuánto consume el parent root, por insumo. */
export type ExpandedRecipe = Map<string, ExpandedIngredient>;

export interface ExpandedIngredient {
  ingredientId: string;
  name: string;
  unitRecipe: string;
  totalQuantity: number;
}
