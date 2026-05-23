import {
  ProductAvailabilityResponseSchema,
  SetSoldOutSchema,
  type ProductAvailability,
} from '@pos-tercos/types';

/** Disponibilidad en vivo de todos los productos (cajero la consulta en intervalos). */
export async function fetchAvailability(): Promise<ProductAvailability[]> {
  const res = await fetch('/api/products/availability', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`fetchAvailability failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ProductAvailabilityResponseSchema.parse(json);
}

/** Marca/desmarca un producto como agotado (86). */
export async function setSoldOut(productId: string, soldOut: boolean): Promise<void> {
  const body = SetSoldOutSchema.parse({ soldOut });
  const res = await fetch(`/api/products/${productId}/sold-out`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `setSoldOut failed: ${res.status}`);
  }
}
