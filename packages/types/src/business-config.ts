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
    message: 'Usa el formato +57 seguido de 10 dígitos.',
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
    message: 'Usa "latitud,longitud" (ej. 6.1658173,-75.580882).',
  });

/**
 * Un dato de pago que el cliente tiene que COPIAR (un Nequi, una cuenta).
 *
 * `value` va separado de su rótulo a propósito: en el mensaje de WhatsApp se
 * imprime SOLO en su línea, sin texto alrededor, para que el cliente lo
 * seleccione de un toque. Metido dentro de una frase ("Nequi: 3046706847") hay
 * que arrastrar la selección a mano sobre el teléfono, y ahí es donde se
 * equivoca un dígito.
 */
export const PaymentAccountSchema = z.object({
  /** "Nequi", "Bancolombia ahorros". */
  label: z.string(),
  /** El número, solo. Es lo único que va en su línea. */
  value: z.string(),
  /** "a nombre de Tercos S.A.S." — opcional, cadena vacía si no aplica. */
  note: z.string(),
});
export type PaymentAccount = z.infer<typeof PaymentAccountSchema>;

export const PaymentAccountInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(60),
  note: z.string().trim().max(120).default(''),
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
  /**
   * A dónde paga el cliente. Vacío ⇒ se cae a `PAYMENT_INSTRUCTIONS_*` (env),
   * que es donde vivían antes: cambiar de cuenta exigía entrar a Railway.
   */
  paymentAccounts: z.array(PaymentAccountSchema),
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
  paymentAccounts: [],
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
    // 6 formas de pago ya es más de lo que alguien lee en un chat.
    paymentAccounts: z.array(PaymentAccountInputSchema).max(6).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Indica al menos un campo a actualizar.',
  });
export type UpdateBusinessConfig = z.infer<typeof UpdateBusinessConfigSchema>;
