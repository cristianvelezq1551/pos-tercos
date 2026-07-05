import { RecipeBookResponseSchema, type RecipeBookResponse } from '@pos-tercos/types';
import { apiGet } from '../../lib/api-client';

export function fetchRecipeBook(): Promise<RecipeBookResponse> {
  return apiGet('/recipe-book', RecipeBookResponseSchema);
}
