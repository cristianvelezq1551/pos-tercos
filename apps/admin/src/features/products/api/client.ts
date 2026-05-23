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

const UploadImageResponseSchema = z.object({
  imageUrl: z.string(),
  key: z.string(),
});

export async function uploadProductImage(
  file: File,
): Promise<{ imageUrl: string; key: string }> {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/products/upload-image', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return UploadImageResponseSchema.parse(json);
}
