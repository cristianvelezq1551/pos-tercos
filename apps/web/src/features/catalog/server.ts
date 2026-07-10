import {
  PublicMenuResponseSchema,
  type PublicMenuResponse,
} from '@pos-tercos/types';
import { publicFetch } from '../../lib/api-server';

const EMPTY: PublicMenuResponse = {
  products: [],
  categories: [],
  promotions: [],
  // Fallback de API caída: no bloquear el checkout por un fetch fallido.
  webOrdersEnabled: true,
  asOf: new Date(0).toISOString(),
};

export async function getMenuServer(): Promise<PublicMenuResponse> {
  // Siempre fresco (no-store): los cambios de menú del admin se reflejan al
  // instante. El menú es una query barata; no vale la pena cachear y arriesgar
  // que el cliente vea un menú viejo.
  const json = await publicFetch<unknown>('/web/menu');
  if (json === null) return EMPTY;
  const parsed = PublicMenuResponseSchema.safeParse(json);
  return parsed.success ? parsed.data : EMPTY;
}
