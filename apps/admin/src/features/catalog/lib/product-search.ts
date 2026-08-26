import type { Product } from '@pos-tercos/types';

/**
 * Normaliza para comparar: minúsculas y sin tildes. El cajero teclea rápido y
 * sin acentos ("pina" tiene que encontrar "Piña").
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sin separadores: "cocacola" encuentra "Coca-Cola" y "7up" encuentra "7 Up". */
function squash(value: string): string {
  return value.replace(/[^a-z0-9]/g, '');
}

/** Lo buscable de un producto: su nombre y su categoría. */
function haystackOf(product: Product): string {
  return normalizeForSearch(`${product.name} ${product.category ?? ''}`);
}

export function matchesProductQuery(product: Product, query: string): boolean {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const text = haystackOf(product);
  const squashed = squash(text);
  // Todos los términos deben aparecer: "coca 400" no trae toda la gaseosa.
  return tokens.every((t) => text.includes(t) || squashed.includes(squash(t)));
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
