import { WebHeroConfigSchema, type WebHeroConfig } from '@pos-tercos/types';
import { publicFetch } from '../../lib/api-server';

const EMPTY: WebHeroConfig = { slides: [], asOf: new Date(0).toISOString() };

/**
 * Publicidad configurable del storefront. Best-effort: si el backend no responde
 * o no hay piezas activas, devuelve vacío y la web cae a su hero estático.
 */
export async function getHeroServer(): Promise<WebHeroConfig> {
  const json = await publicFetch<unknown>('/web-hero/config');
  if (json === null) return EMPTY;
  const parsed = WebHeroConfigSchema.safeParse(json);
  return parsed.success ? parsed.data : EMPTY;
}
