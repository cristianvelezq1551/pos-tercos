import { ProductSchema, type Product } from '@pos-tercos/types';
import { z } from 'zod';
import { serverFetch } from '../../lib/api-server';

const ListSchema = z.array(ProductSchema);

export async function getActiveProductsServer(): Promise<Product[]> {
  const res = await serverFetch('/products?only_active=true');
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as unknown;
  const parsed = ListSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}
