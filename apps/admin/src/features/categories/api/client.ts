import {
  CreateProductCategorySchema,
  ProductCategorySchema,
  UpdateProductCategorySchema,
  type CreateProductCategory,
  type ProductCategory,
  type UpdateProductCategory,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const CategoryListSchema = z.array(ProductCategorySchema);

export function listCategories(onlyActive = false): Promise<ProductCategory[]> {
  const qs = onlyActive ? '?only_active=true' : '';
  return request(`/product-categories${qs}`, { method: 'GET' }, CategoryListSchema);
}

export function createCategory(input: CreateProductCategory): Promise<ProductCategory> {
  CreateProductCategorySchema.parse(input);
  return request(
    '/product-categories',
    { method: 'POST', body: JSON.stringify(input) },
    ProductCategorySchema,
  );
}

export function updateCategory(
  id: string,
  input: UpdateProductCategory,
): Promise<ProductCategory> {
  UpdateProductCategorySchema.parse(input);
  return request(
    `/product-categories/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    ProductCategorySchema,
  );
}

/** DELETE responde 204 sin cuerpo → fetch directo (el wrapper espera JSON). */
export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`/api/product-categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
}
