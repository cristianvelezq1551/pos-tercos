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
 *
 * ⚠️ El fallback trae `deliveryEnabled: false`: un hipo de red no cierra la
 * tienda (`acceptingOrders` queda en true) pero SÍ esconde los domicilios, y
 * eso es invisible desde afuera —el cliente simplemente no ve la opción—.
 * Por eso se loguea: si "desaparecieron los domicilios", el motivo queda acá
 * y no en una cacería de una hora por el switch del admin.
 */
export async function getHeroServer(): Promise<WebStorefrontConfig> {
  const json = await publicFetch<unknown>('/web-hero/config');
  if (json === null) {
    console.error('[web] /web-hero/config no respondió — la web cae a los defaults (sin domicilios).');
    return EMPTY;
  }
  const parsed = WebStorefrontConfigSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      `[web] /web-hero/config devolvió un payload inválido — defaults (sin domicilios): ${parsed.error.message}`,
    );
    return EMPTY;
  }
  return parsed.data;
}
