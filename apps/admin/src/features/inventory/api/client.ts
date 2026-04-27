import {
  CreateInventoryMovementSchema,
  IngredientWithStockSchema,
  InventoryMovementSchema,
  type CreateInventoryMovement,
  type IngredientWithStock,
  type InventoryMovement,
} from '@pos-tercos/types';
import { z } from 'zod';

const StockListSchema = z.array(IngredientWithStockSchema);
const MovementsListSchema = z.array(InventoryMovementSchema);

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

export function listStock(
  filter: { onlyActive?: boolean; lowStock?: boolean } = {},
): Promise<IngredientWithStock[]> {
  const params = new URLSearchParams();
  if (filter.onlyActive) params.set('only_active', 'true');
  if (filter.lowStock) params.set('low_stock', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request(`/inventory/stock${qs}`, { method: 'GET' }, StockListSchema);
}

export function getStock(id: string): Promise<IngredientWithStock> {
  return request(`/inventory/stock/${id}`, { method: 'GET' }, IngredientWithStockSchema);
}

export function listMovements(
  filter: { ingredientId?: string; type?: string; limit?: number } = {},
): Promise<InventoryMovement[]> {
  const params = new URLSearchParams();
  if (filter.ingredientId) params.set('ingredient_id', filter.ingredientId);
  if (filter.type) params.set('type', filter.type);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request(`/inventory/movements${qs}`, { method: 'GET' }, MovementsListSchema);
}

export function createMovement(input: CreateInventoryMovement): Promise<InventoryMovement> {
  CreateInventoryMovementSchema.parse(input);
  return request(
    '/inventory/movements',
    { method: 'POST', body: JSON.stringify(input) },
    InventoryMovementSchema,
  );
}
