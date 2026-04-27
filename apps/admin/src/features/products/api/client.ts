import {
  CreateProductSchema,
  ProductSchema,
  UpdateProductSchema,
  type CreateProduct,
  type Product,
  type UpdateProduct,
} from '@pos-tercos/types';
import { z } from 'zod';

const ProductListSchema = z.array(ProductSchema);

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
  return request(`/products/${id}`, { method: 'DELETE' }, ProductSchema);
}
