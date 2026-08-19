import { z } from 'zod';

// ====================================================================
// WEB HERO — publicidad configurable del storefront web (encima del menú).
// El dueño administra qué imágenes/videos se muestran arriba de la página y a
// dónde lleva cada pieza al tocarla. Hermano del módulo `display` (turnero TV):
// aquél muestra productos en el TV; éste, publicidad en la web del cliente.
// Fase 1: solo imágenes. `mediaType` queda listo para sumar VIDEO en fase 2.
// ====================================================================

export const HeroMediaTypeEnum = z.enum(['IMAGE', 'VIDEO']);
export type HeroMediaType = z.infer<typeof HeroMediaTypeEnum>;

/** Link de una pieza: ruta interna (`/...`, `#...`) o URL http(s) externa. */
const HeroLinkSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (v) => v.startsWith('/') || v.startsWith('#') || /^https?:\/\//i.test(v),
    'El link debe ser una URL http(s) o una ruta interna (/... o #...)',
  );

/** Una pieza de publicidad. El medio se sirve por `GET /web-hero/media/:id`. */
export const WebHeroSlideSchema = z.object({
  id: z.string().uuid(),
  mediaType: HeroMediaTypeEnum,
  /** URL para cargar el medio (apunta al endpoint público de bytes). */
  mediaUrl: z.string().min(1).max(300),
  /** A dónde lleva al tocar la pieza. null = no clickeable. */
  linkUrl: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type WebHeroSlide = z.infer<typeof WebHeroSlideSchema>;

/** Crear pieza (el medio va por multipart en el mismo POST). */
export const CreateWebHeroSlideSchema = z.object({
  linkUrl: HeroLinkSchema.nullable().optional(),
});
export type CreateWebHeroSlide = z.infer<typeof CreateWebHeroSlideSchema>;

export const UpdateWebHeroSlideSchema = z.object({
  linkUrl: HeroLinkSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebHeroSlide = z.infer<typeof UpdateWebHeroSlideSchema>;

// La respuesta pública (`GET /web-hero/config`) vive en `web-config.ts`: dejó de
// ser solo publicidad y ahora lleva contacto, horarios, redes y "Nosotros".
// Ver `WebStorefrontConfigSchema`.
