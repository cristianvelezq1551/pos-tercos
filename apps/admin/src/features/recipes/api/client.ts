import {
  ExpandedCostResponseSchema,
  FifoLotsResponseSchema,
  RecipeResponseSchema,
  type ExpandedCostResponse,
  type FifoLotsResponse,
  type RecipeEdgeInput,
  type RecipeResponse,
} from '@pos-tercos/types';
import { z } from 'zod';

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
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      cyclePath?: string[];
    };
    const detail = body.cyclePath ? ` (ciclo: ${body.cyclePath.join(' → ')})` : '';
    throw new Error(`${body.message ?? `Request failed (${res.status})`}${detail}`);
  }
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

export function getProductRecipe(id: string): Promise<RecipeResponse> {
  return request(`/products/${id}/recipe`, { method: 'GET' }, RecipeResponseSchema);
}

export function setProductRecipe(
  id: string,
  edges: RecipeEdgeInput[],
): Promise<RecipeResponse> {
  return request(
    `/products/${id}/recipe`,
    { method: 'PUT', body: JSON.stringify({ edges }) },
    RecipeResponseSchema,
  );
}

export function getSubproductRecipe(id: string): Promise<RecipeResponse> {
  return request(`/subproducts/${id}/recipe`, { method: 'GET' }, RecipeResponseSchema);
}

export function setSubproductRecipe(
  id: string,
  edges: RecipeEdgeInput[],
): Promise<RecipeResponse> {
  return request(
    `/subproducts/${id}/recipe`,
    { method: 'PUT', body: JSON.stringify({ edges }) },
    RecipeResponseSchema,
  );
}

export function getSizeRecipe(productId: string, sizeId: string): Promise<RecipeResponse> {
  return request(
    `/products/${productId}/sizes/${sizeId}/recipe`,
    { method: 'GET' },
    RecipeResponseSchema,
  );
}

export function setSizeRecipe(
  productId: string,
  sizeId: string,
  edges: RecipeEdgeInput[],
): Promise<RecipeResponse> {
  return request(
    `/products/${productId}/sizes/${sizeId}/recipe`,
    { method: 'PUT', body: JSON.stringify({ edges }) },
    RecipeResponseSchema,
  );
}

export function getExpandedCost(id: string): Promise<ExpandedCostResponse> {
  return request(`/products/${id}/expanded-cost`, { method: 'GET' }, ExpandedCostResponseSchema);
}

/** Lotes FIFO restantes por stockable — para el rendimiento por lote en el editor. */
export function getFifoLots(): Promise<FifoLotsResponse> {
  return request('/reports/cogs/fifo-lots', { method: 'GET' }, FifoLotsResponseSchema);
}

export function getSubproductExpandedCost(id: string): Promise<ExpandedCostResponse> {
  return request(`/subproducts/${id}/expanded-cost`, { method: 'GET' }, ExpandedCostResponseSchema);
}

export function getSizeExpandedCost(
  productId: string,
  sizeId: string,
): Promise<ExpandedCostResponse> {
  return request(
    `/products/${productId}/sizes/${sizeId}/expanded-cost`,
    { method: 'GET' },
    ExpandedCostResponseSchema,
  );
}
