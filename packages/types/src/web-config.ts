import { z } from 'zod';
import { DEFAULT_OPENING_HOURS, OpeningHoursSchema } from './schedule';
import { WebHeroSlideSchema } from './web-hero';

/**
 * TODA la config que la web del cliente necesita, en UNA sola respuesta
 * (`GET /web-hero/config`). Decisión del dueño 2026-07-16: el endpoint que ya
 * traía la publicidad pasa a traer también contacto, horarios, redes y los
 * textos de "Nosotros" — así el dueño edita todo desde el admin sin redeploy y
 * la web hace un solo fetch.
 *
 * Es un subset SEGURO: acá NO va nada que el negocio no quiera público.
 */

export const BusinessContactSchema = z.object({
  /** E.164 (+57XXXXXXXXXX) o '' si no está configurado. La web arma tel:/wa.me. */
  phone: z.string(),
  /** Cómo se muestra el número. Ej. "+57 320 761 5261". */
  phoneDisplay: z.string(),
  address: z.string(),
  /** Ficha en Google Maps (link corto o largo). */
  mapsUrl: z.string().nullable(),
  /** "lat,lng" — alimenta el mapa embebido y el deeplink de Waze. */
  coords: z.string().nullable(),
});
export type BusinessContact = z.infer<typeof BusinessContactSchema>;

export const BusinessSocialSchema = z.object({
  instagram: z.string().nullable(),
  tiktok: z.string().nullable(),
});
export type BusinessSocial = z.infer<typeof BusinessSocialSchema>;

export const BusinessValueSchema = z.object({
  title: z.string(),
  description: z.string(),
});
export type BusinessValue = z.infer<typeof BusinessValueSchema>;

export const BusinessAboutSchema = z.object({
  headline: z.string(),
  story: z.string(),
  values: z.array(BusinessValueSchema),
  /** Foto que acompaña la historia. null = la web cae a su fondo degradado. */
  imageUrl: z.string().nullable(),
});
export type BusinessAbout = z.infer<typeof BusinessAboutSchema>;

export const BusinessScheduleStateSchema = z.object({
  hours: OpeningHoursSchema,
  /**
   * Calculado por el SERVER al responder (TZ=America/Bogota en prod). Es la
   * verdad: el navegador del cliente puede tener la hora o la zona mal.
   */
  isOpenNow: z.boolean(),
  /** Próxima apertura en ISO. null = no abre en las próximas 2 semanas. */
  nextOpenAt: z.string().datetime().nullable(),
  /** false = se aceptan pedidos aunque esté cerrado (el switch del dueño). */
  ordersRespectSchedule: z.boolean(),
});
export type BusinessScheduleState = z.infer<typeof BusinessScheduleStateSchema>;

/**
 * Zona de cobertura. La web mide la distancia con el GPS del navegador y avisa
 * ANTES de que el cliente llene el formulario; el server revalida al crear el
 * pedido (la web no es la autoridad — el endpoint es público).
 */
export const BusinessRadiusStateSchema = z.object({
  /** false = no se reparte: la web no ofrece la opción de domicilio. */
  deliveryEnabled: z.boolean(),
  /** Radio en km desde el local. */
  radiusKm: z.number(),
  /** false = no se valida distancia (el switch del dueño). */
  ordersRespectRadius: z.boolean(),
  /** "lat,lng" del local. null ⇒ no se puede medir nada y no se bloquea a nadie. */
  originCoords: z.string().nullable(),
});
export type BusinessRadiusState = z.infer<typeof BusinessRadiusStateSchema>;

export const PublicBusinessInfoSchema = z.object({
  contact: BusinessContactSchema,
  social: BusinessSocialSchema,
  about: BusinessAboutSchema,
  schedule: BusinessScheduleStateSchema,
  radius: BusinessRadiusStateSchema,
  /** Kill-switch (#13). false ⇒ no se toman pedidos, pase lo que pase. */
  webOrdersEnabled: z.boolean(),
  /**
   * ¿Se puede pedir AHORA? = webOrdersEnabled && (!ordersRespectSchedule || isOpenNow).
   * Lo resuelve el server para que la web no reimplemente la regla.
   */
  acceptingOrders: z.boolean(),
});
export type PublicBusinessInfo = z.infer<typeof PublicBusinessInfoSchema>;

/**
 * Respuesta de `GET /web-hero/config`. Si `slides` viene vacío la web cae a su
 * hero estático; si el backend no responde, cae a defaults y no se rompe.
 */
export const WebStorefrontConfigSchema = z.object({
  slides: z.array(WebHeroSlideSchema),
  business: PublicBusinessInfoSchema,
  asOf: z.string().datetime(),
});
export type WebStorefrontConfig = z.infer<typeof WebStorefrontConfigSchema>;

/**
 * Fallback de la web cuando el backend no responde. Neutro a propósito: sin
 * datos de contacto inventados, y `acceptingOrders: true` para no bloquear el
 * pedido por un hipo de red (el server igual valida al crear).
 */
export const EMPTY_PUBLIC_BUSINESS_INFO: PublicBusinessInfo = {
  contact: { phone: '', phoneDisplay: '', address: '', mapsUrl: null, coords: null },
  social: { instagram: null, tiktok: null },
  about: { headline: '', story: '', values: [], imageUrl: null },
  schedule: {
    hours: DEFAULT_OPENING_HOURS,
    isOpenNow: true,
    nextOpenAt: null,
    ordersRespectSchedule: false,
  },
  radius: {
    deliveryEnabled: false,
    radiusKm: 10,
    ordersRespectRadius: false,
    originCoords: null,
  },
  webOrdersEnabled: true,
  acceptingOrders: true,
};
