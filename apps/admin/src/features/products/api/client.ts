import {
  CreateProductSchema,
  ProductSchema,
  UpdateProductSchema,
  type CreateProduct,
  type Product,
  type SetComboComponents,
  type SetProductOptions,
  type UpdateProduct,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const ProductListSchema = z.array(ProductSchema);

export function listProducts(): Promise<Product[]> {
  return request('/products', { method: 'GET' }, ProductListSchema);
}

export function getProduct(id: string): Promise<Product> {
  return request(`/products/${id}`, { method: 'GET' }, ProductSchema);
}

export function createProduct(input: CreateProduct): Promise<Product> {
  CreateProductSchema.parse(input);
  return request(
    '/products',
    { method: 'POST', body: JSON.stringify(input) },
    ProductSchema,
  );
}

export function updateProduct(id: string, input: UpdateProduct): Promise<Product> {
  UpdateProductSchema.parse(input);
  return request(
    `/products/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    ProductSchema,
  );
}

export function deactivateProduct(id: string): Promise<Product> {
  return request(`/products/${id}/deactivate`, { method: 'POST' }, ProductSchema);
}

/** Elimina DEFINITIVAMENTE (solo si no tiene historial ni está en combos). */
export async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
}

/** Reemplaza variantes + extras de un producto existente. */
export function setProductOptions(id: string, input: SetProductOptions): Promise<Product> {
  return request(
    `/products/${id}/options`,
    { method: 'PUT', body: JSON.stringify(input) },
    ProductSchema,
  );
}

/** Reemplaza los componentes de un combo existente. */
export function setComboComponents(id: string, input: SetComboComponents): Promise<Product> {
  return request(
    `/products/${id}/combo`,
    { method: 'PUT', body: JSON.stringify(input) },
    ProductSchema,
  );
}


