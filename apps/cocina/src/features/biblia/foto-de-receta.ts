import type { RecipeBookEntry } from '@pos-tercos/types';

/**
 * Qué foto muestra la biblia. Manda la de la PREPARACIÓN —cómo se arma— y la
 * de la carta queda de respaldo: quien ya tenía fotos de producto las sigue
 * viendo sin cargar nada nuevo. Null = no hay ninguna.
 */
export function fotoDeReceta(entry: Pick<RecipeBookEntry, 'prepImageUrl' | 'imageUrl'>): string | null {
  return entry.prepImageUrl ?? entry.imageUrl ?? null;
}
