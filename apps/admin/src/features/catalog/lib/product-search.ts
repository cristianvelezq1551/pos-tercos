import type { Product } from '@pos-tercos/types';
import { matchesQuery, normalizeForSearch } from '../../../lib/buscar';

// La normalización y el criterio de coincidencia son transversales (los usan
// también las tablas de catálogo del admin): viven en `lib/buscar`.
export { normalizeForSearch };

/** Lo buscable de un producto: su nombre y su categoría. */
function haystackOf(product: Product): string {
  return normalizeForSearch(`${product.name} ${product.category ?? ''}`);
}

export function matchesProductQuery(product: Product, query: string): boolean {
  return matchesQuery(haystackOf(product), query);
}

/**
 * Filtra el catálogo por texto. Ordena primero lo que EMPIEZA por lo tecleado:
 * escribir "po" debe dejar "Pollo" arriba, no "Sopa de pollo".
 */
export function filterProductsByQuery(products: Product[], query: string): Product[] {
  const normalized = normalizeForSearch(query);
  if (!normalized) return products;
  const matches = products.filter((p) => matchesProductQuery(p, normalized));
  return matches.sort((a, b) => {
    const aStarts = haystackOf(a).startsWith(normalized) ? 0 : 1;
    const bStarts = haystackOf(b).startsWith(normalized) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.name.localeCompare(b.name, 'es');
  });
}
