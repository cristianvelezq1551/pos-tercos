import type { PrepImage, RecipeBookEntry } from '@pos-tercos/types';

/**
 * Qué fotos muestra la biblia. Mandan las de la PREPARACIÓN —cómo se arma, y
 * una por variante cuando el plato cambia— y la de la carta queda de respaldo:
 * quien ya tenía fotos de producto las sigue viendo sin cargar nada nuevo.
 * Lista vacía = no hay ninguna.
 */
export function fotosDeReceta(
  entry: Pick<RecipeBookEntry, 'prepImages' | 'imageUrl'>,
): PrepImage[] {
  if (entry.prepImages.length > 0) return entry.prepImages;
  return entry.imageUrl ? [{ url: entry.imageUrl, label: null }] : [];
}

/** La que representa la ficha en la lista: la primera. */
export function fotoPrincipal(
  entry: Pick<RecipeBookEntry, 'prepImages' | 'imageUrl'>,
): string | null {
  return fotosDeReceta(entry)[0]?.url ?? null;
}
