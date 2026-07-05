import {
  KitchenCountResultSchema,
  StockableSchema,
  type KitchenCount,
  type KitchenCountResult,
  type RegisterWaste,
  type Stockable,
} from '@pos-tercos/types';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api-client';

export function fetchKitchenStock(): Promise<Stockable[]> {
  return apiGet('/kitchen/stock', z.array(StockableSchema));
}

export function registerWaste(body: RegisterWaste): Promise<Stockable> {
  return apiSend('/kitchen/waste', body, StockableSchema);
}

export function registerCount(body: KitchenCount): Promise<KitchenCountResult> {
  return apiSend('/kitchen/count', body, KitchenCountResultSchema);
}

/** Mapea un Stockable al selector polimórfico { entityType, <id> } del backend. */
export function stockableRef(s: Stockable): {
  entityType: Stockable['type'];
  ingredientId?: string;
  productId?: string;
  subproductId?: string;
} {
  if (s.type === 'INGREDIENT') return { entityType: 'INGREDIENT', ingredientId: s.id };
  if (s.type === 'PRODUCT') return { entityType: 'PRODUCT', productId: s.id };
  return { entityType: 'SUBPRODUCT', subproductId: s.id };
}
