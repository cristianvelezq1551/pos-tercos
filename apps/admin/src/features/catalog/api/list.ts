import { ProductSchema, type Product } from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(ProductSchema);

export async function fetchActiveProducts(): Promise<Product[]> {
  const res = await fetch('/api/products?only_active=true', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`fetchActiveProducts failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ListSchema.parse(json);
}
