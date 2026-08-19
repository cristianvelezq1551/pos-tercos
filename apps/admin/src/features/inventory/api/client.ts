import {
  CreateInventoryMovementSchema,
  InventoryMovementSchema,
  ReverseWasteSchema,
  StockableSchema,
  type CreateInventoryMovement,
  type InventoryMovement,
  type ReverseWaste,
  type Stockable,
  type StockableType,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const StockListSchema = z.array(StockableSchema);
const MovementsListSchema = z.array(InventoryMovementSchema);

export function listStock(
  filter: { onlyActive?: boolean; lowStock?: boolean; negative?: boolean } = {},
): Promise<Stockable[]> {
  const params = new URLSearchParams();
  if (filter.onlyActive) params.set('only_active', 'true');
  if (filter.lowStock) params.set('low_stock', 'true');
  if (filter.negative) params.set('negative', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request(`/inventory/stock${qs}`, { method: 'GET' }, StockListSchema);
}

export function getStock(entityType: StockableType, id: string): Promise<Stockable> {
  return request(
    `/inventory/stock/${entityType.toLowerCase()}/${id}`,
    { method: 'GET' },
    StockableSchema,
  );
}

export function listMovements(
  filter: {
    entityType?: StockableType;
    ingredientId?: string;
    productId?: string;
    type?: string;
    limit?: number;
  } = {},
): Promise<InventoryMovement[]> {
  const params = new URLSearchParams();
  if (filter.entityType) params.set('entity_type', filter.entityType);
  if (filter.ingredientId) params.set('ingredient_id', filter.ingredientId);
  if (filter.productId) params.set('product_id', filter.productId);
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

/**
 * Anula una merma registrada por error. `quantity` omitido = la merma entera.
 * Es la única forma de sacar esa pérdida del estado financiero.
 */
export function reverseWaste(
  movementId: string,
  input: ReverseWaste,
): Promise<InventoryMovement> {
  ReverseWasteSchema.parse(input);
  return request(
    `/inventory/movements/${movementId}/reverse-waste`,
    { method: 'POST', body: JSON.stringify(input) },
    InventoryMovementSchema,
  );
}
