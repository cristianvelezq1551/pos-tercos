import { z } from 'zod';
import { DEFAULT_OPENING_HOURS, OpeningHoursSchema } from './schedule';
import { BusinessValueSchema } from './web-config';

/**
 * Config global del negocio (fila única). Dos familias de campos:
 *
 *  - Operación/finanzas: `monthStartDay` (día de corte del mes del negocio),
 *    `webOrdersEnabled` (kill-switch de pedidos web, #13).
 *  - Web del cliente (2026-07-16): contacto, horarios, redes y "Nosotros". El
 *    dueño los edita desde el admin y salen por `GET /web-hero/config` sin
 *    redeploy. Antes vivían hardcodeados o como variables de entorno.
 */

/** E.164 colombiano, igual que el teléfono del checkout. '' = sin configurar. */
const PhoneSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\+57\d{10}$/.test(v), {
    message: 'Usá formato +57 seguido de 10 dígitos.',
  });

/** URL http(s) o '' para dejarla vacía. */
const OptionalUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), {
    message: 'Debe ser una URL http(s).',
  });

/** "lat,lng" con punto decimal. '' = sin resolver (el server intenta deducirlo). */
const CoordsSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/.test(v), {
    message: 'Usá "latitud,longitud" (ej. 6.1658173,-75.580882).',
  });

export const BusinessConfigSchema = z.object({
  monthStartDay: z.number().int().min(1).max(28),
  webOrdersEnabled: z.boolean(),
  // ── Web del cliente ──
  phone: z.string(),
  phoneDisplay: z.string(),
  address: z.string(),
  mapsUrl: z.string(),
  coords: z.string(),
  hours: OpeningHoursSchema,
  ordersRespectSchedule: z.boolean(),
  deliveryEnabled: z.boolean(),
  orderRadiusKm: z.number(),
  ordersRespectRadius: z.boolean(),
  instagramUrl: z.string(),
  tiktokUrl: z.string(),
  aboutHeadline: z.string(),
  aboutStory: z.string(),
  aboutValues: z.array(BusinessValueSchema),
  /** URL de la foto de "Nosotros". null = no hay. Se sube por su propio endpoint. */
  aboutImageUrl: z.string().nullable(),
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;

/** Fallback para cuando el API no responde. Nada de negocio, solo shape válido. */
export const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  monthStartDay: 1,
  webOrdersEnabled: true,
  phone: '',
  phoneDisplay: '',
  address: '',
  mapsUrl: '',
  coords: '',
  hours: DEFAULT_OPENING_HOURS,
  ordersRespectSchedule: false,
  deliveryEnabled: false,
  orderRadiusKm: 10,
  ordersRespectRadius: false,
  instagramUrl: '',
  tiktokUrl: '',
  aboutHeadline: '',
  aboutStory: '',
  aboutValues: [],
  aboutImageUrl: null,
};

const AboutValueInputSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(400),
});

export const UpdateBusinessConfigSchema = z
  .object({
    monthStartDay: z.number().int().min(1).max(28).optional(),
    webOrdersEnabled: z.boolean().optional(),
    phone: PhoneSchema.optional(),
    phoneDisplay: z.string().trim().max(40).optional(),
    address: z.string().trim().max(200).optional(),
    mapsUrl: OptionalUrlSchema.optional(),
    coords: CoordsSchema.optional(),
    hours: OpeningHoursSchema.optional(),
    ordersRespectSchedule: z.boolean().optional(),
    // Tope de 100 km: más que eso no es un radio de cobertura, es un error de tipeo.
    deliveryEnabled: z.boolean().optional(),
    orderRadiusKm: z.number().min(0.1).max(100).optional(),
    ordersRespectRadius: z.boolean().optional(),
    instagramUrl: OptionalUrlSchema.optional(),
    tiktokUrl: OptionalUrlSchema.optional(),
    aboutHeadline: z.string().trim().max(120).optional(),
    aboutStory: z.string().trim().max(2000).optional(),
    aboutValues: z.array(AboutValueInputSchema).max(6).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Indicá al menos un campo a actualizar.',
  });
export type UpdateBusinessConfig = z.infer<typeof UpdateBusinessConfigSchema>;
