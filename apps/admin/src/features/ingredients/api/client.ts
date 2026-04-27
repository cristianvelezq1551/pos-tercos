import {
  CreateIngredientSchema,
  IngredientSchema,
  UpdateIngredientSchema,
  type CreateIngredient,
  type Ingredient,
  type UpdateIngredient,
} from '@pos-tercos/types';
import { z } from 'zod';

const IngredientListSchema = z.array(IngredientSchema);

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

export function listIngredients(): Promise<Ingredient[]> {
  return request('/ingredients', { method: 'GET' }, IngredientListSchema);
}

export function getIngredient(id: string): Promise<Ingredient> {
  return request(`/ingredients/${id}`, { method: 'GET' }, IngredientSchema);
}

export function createIngredient(input: CreateIngredient): Promise<Ingredient> {
  CreateIngredientSchema.parse(input);
  return request(
    '/ingredients',
    { method: 'POST', body: JSON.stringify(input) },
    IngredientSchema,
  );
}

export function updateIngredient(id: string, input: UpdateIngredient): Promise<Ingredient> {
  UpdateIngredientSchema.parse(input);
  return request(
    `/ingredients/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    IngredientSchema,
  );
}

export function deactivateIngredient(id: string): Promise<Ingredient> {
  return request(`/ingredients/${id}`, { method: 'DELETE' }, IngredientSchema);
}
