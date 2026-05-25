import {
  ProductAvailabilityResponseSchema,
  ProductSchema,
  PromotionSchema,
  type Shift,
  type User,
} from '@pos-tercos/types';
import { z } from 'zod';
import { offlineDb } from './db';

/**
 * Escritores de cache para el respaldo offline. `offline` es una HOJA del grafo
 * de features (otros features lo importan en B.2+), así que NO depende de
 * `catalog`/`sales` — trae sus propios fetchers mínimos para no crear ciclos.
 */

const ProductsSchema = z.array(ProductSchema);
const PromotionsSchema = z.array(PromotionSchema);

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(path, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

/** Guarda la sesión vigente (user + shift) para abrir offline sin SSR. */
export async function cacheSession(user: User, shift: Shift | null): Promise<void> {
  await offlineDb.setSession({ user, shift, cachedAt: new Date().toISOString() });
}

/** Refresca el catálogo + promos + disponibilidad cacheados (solo si hay red). */
export async function cacheCatalog(): Promise<void> {
  const [productsRaw, promotionsRaw, availabilityRaw] = await Promise.all([
    getJson('/api/products?only_active=true'),
    getJson('/api/promotions?only_active=true'),
    getJson('/api/products/availability'),
  ]);
  await offlineDb.setCatalog({
    products: ProductsSchema.parse(productsRaw),
    promotions: PromotionsSchema.parse(promotionsRaw),
    availability: ProductAvailabilityResponseSchema.parse(availabilityRaw),
    cachedAt: new Date().toISOString(),
  });
}
