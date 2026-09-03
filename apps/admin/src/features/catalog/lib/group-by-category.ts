import type { Product } from '@pos-tercos/types';

export interface CategoryGroup {
  /** Nombre de la categoría, o null para los productos sin categoría. */
  category: string | null;
  products: Product[];
}

/**
 * Parte el catálogo en bloques por categoría, RESPETANDO el orden en que
 * vienen los productos: el server ya los manda en el orden que el dueño arma
 * en `/categories`, y reordenar acá lo perdería.
 *
 * Sin agrupar, la vista "Todos" era una bolsa revuelta y las bebidas —12 de
 * los 22 productos de este local— tapaban los platos. Los productos sin
 * categoría van al final: son los que alguien cargó a medias, no el menú.
 */
export function groupByCategory(products: Product[]): CategoryGroup[] {
  const grupos: CategoryGroup[] = [];
  const porNombre = new Map<string, CategoryGroup>();
  let sinCategoria: CategoryGroup | null = null;

  for (const p of products) {
    if (!p.category) {
      sinCategoria ??= { category: null, products: [] };
      sinCategoria.products.push(p);
      continue;
    }
    let g = porNombre.get(p.category);
    if (!g) {
      g = { category: p.category, products: [] };
      porNombre.set(p.category, g);
      grupos.push(g);
    }
    g.products.push(p);
  }

  return sinCategoria ? [...grupos, sinCategoria] : grupos;
}

/** Las categorías en el orden en que aparecen. Ordenar por nombre acá dejaba
 *  "Bebidas" de primera en los chips, que es justo lo que se corrigió. */
export function categoriesInOrder(products: Product[]): string[] {
  return groupByCategory(products)
    .map((g) => g.category)
    .filter((c): c is string => c !== null);
}
