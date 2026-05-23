import {
  PublicMenuResponseSchema,
  type PublicMenuResponse,
} from '@pos-tercos/types';
import { publicFetch } from '../../lib/api-server';

const EMPTY: PublicMenuResponse = {
  products: [],
  categories: [],
  asOf: new Date(0).toISOString(),
};

export async function getMenuServer(): Promise<PublicMenuResponse> {
  // Menú público: cambia poco. ISR 60s — HTML cacheado, refresca en background.
  const json = await publicFetch<unknown>('/web/menu', {
    next: { revalidate: 60 },
  });
  if (json === null) return EMPTY;
  const parsed = PublicMenuResponseSchema.safeParse(json);
  return parsed.success ? parsed.data : EMPTY;
}
