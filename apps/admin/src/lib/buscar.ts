/**
 * Búsqueda por texto de las listas del admin. Vive en `lib/` porque la usan
 * tanto el catálogo de la caja como las tablas de insumos, subproductos y
 * productos: una regla de búsqueda copiada en cada pantalla termina buscando
 * distinto en cada una.
 */

/**
 * Normaliza para comparar: minúsculas y sin tildes. Se teclea rápido y sin
 * acentos ("pina" tiene que encontrar "Piña").
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
export function squashForSearch(value: string): string {
  return normalizeForSearch(value).replace(/[^a-z0-9]/g, '');
}

/**
 * Todos los términos tecleados deben aparecer en el texto: "coca 400" no trae
 * toda la gaseosa. Sin texto tecleado, todo coincide.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const text = normalizeForSearch(haystack);
  const squashed = squashForSearch(haystack);
  return tokens.every((t) => text.includes(t) || squashed.includes(squashForSearch(t)));
}

/**
 * Filtra una lista por lo tecleado, CONSERVANDO el orden que traía. Una tabla
 * ya viene ordenada (alfabética) y reordenarla mientras se escribe hace que la
 * fila que se estaba mirando salte de lugar.
 */
export function filtrarPorTexto<T>(rows: T[], query: string, textoDe: (row: T) => string): T[] {
  if (normalizeForSearch(query).length === 0) return rows;
  return rows.filter((row) => matchesQuery(textoDe(row), query));
}
