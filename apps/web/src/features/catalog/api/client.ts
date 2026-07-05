import {
  ProductAvailabilityResponseSchema,
  PublicMenuResponseSchema,
  type ProductAvailability,
  type PublicMenuProduct,
} from '@pos-tercos/types';

/**
 * Fetchers tipados del menú/disponibilidad pública (cliente). Centralizan el
 * fetch + el parse Zod para que los hooks no peguen `fetch` crudo.
 */

/** Menú público. Devuelve null si el endpoint falla (best-effort). */
export async function fetchPublicMenu(): Promise<PublicMenuProduct[] | null> {
  const res = await fetch('/api/web/menu', { cache: 'no-store' });
  if (!res.ok) return null;
  const parsed = PublicMenuResponseSchema.safeParse(await res.json());
  return parsed.success ? parsed.data.products : null;
}

/** Disponibilidad en vivo por producto. Devuelve null si el endpoint falla. */
export async function fetchAvailability(): Promise<ProductAvailability[] | null> {
  const res = await fetch('/api/products/availability', { cache: 'no-store' });
  if (!res.ok) return null;
  const parsed = ProductAvailabilityResponseSchema.safeParse(await res.json());
  return parsed.success ? parsed.data : null;
}
