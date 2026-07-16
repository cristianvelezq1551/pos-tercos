import {
  EMPTY_PUBLIC_BUSINESS_INFO,
  WebStorefrontConfigSchema,
  type WebStorefrontConfig,
} from '@pos-tercos/types';
import { publicFetch } from '../../lib/api-server';

const EMPTY: WebStorefrontConfig = {
  slides: [],
  business: EMPTY_PUBLIC_BUSINESS_INFO,
  asOf: new Date(0).toISOString(),
};

/**
 * Config del storefront: publicidad + contacto, horarios, redes y "Nosotros".
 * Best-effort: si el backend no responde o el payload no valida, devuelve
 * defaults neutros y la web sigue funcionando (cae a su hero estático).
 */
export async function getHeroServer(): Promise<WebStorefrontConfig> {
  const json = await publicFetch<unknown>('/web-hero/config');
  if (json === null) return EMPTY;
  const parsed = WebStorefrontConfigSchema.safeParse(json);
  return parsed.success ? parsed.data : EMPTY;
}
