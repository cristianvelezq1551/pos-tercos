import {
  GeocodeResponseSchema,
  type GeocodeResponse,
} from '@pos-tercos/types';

export async function geocodeAddress(address: string): Promise<GeocodeResponse> {
  const res = await fetch(
    `/api/web/geocode?address=${encodeURIComponent(address)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return GeocodeResponseSchema.parse(json);
}
