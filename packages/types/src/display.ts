import { z } from 'zod';

// ====================================================================
// DISPLAY CONTENT — contenido configurable del turnero (B-roll + música)
// El dueño administra qué productos/fotos/precios se muestran y los tracks
// de música ambiente, antes hardcodeados en el frontend.
// ====================================================================

/** Un slide del B-roll. La imagen se sirve por `GET /display/slide-image/:id`. */
export const DisplaySlideSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  /** Categoría en la pastilla roja (eyebrow). */
  tag: z.string().min(1).max(30),
  /** Precio de vitrina, texto libre (ej. "$29K"). */
  price: z.string().min(1).max(20),
  description: z.string().min(1).max(280),
  /** URL para cargar la imagen (apunta al endpoint público de bytes). */
  imageUrl: z.string().min(1).max(300),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type DisplaySlide = z.infer<typeof DisplaySlideSchema>;

/** Crear/editar metadata de un slide (la imagen va por endpoint aparte). */
export const CreateDisplaySlideSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tag: z.string().trim().min(1).max(30),
  price: z.string().trim().min(1).max(20),
  description: z.string().trim().min(1).max(280),
});
export type CreateDisplaySlide = z.infer<typeof CreateDisplaySlideSchema>;

export const UpdateDisplaySlideSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  tag: z.string().trim().min(1).max(30).optional(),
  price: z.string().trim().min(1).max(20).optional(),
  description: z.string().trim().min(1).max(280).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDisplaySlide = z.infer<typeof UpdateDisplaySlideSchema>;

/** Una pista de música ambiente. El audio se sirve por `GET /display/track-audio/:id`. */
export const DisplayTrackSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(80),
  audioUrl: z.string().min(1).max(300),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type DisplayTrack = z.infer<typeof DisplayTrackSchema>;

export const UpdateDisplayTrackSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDisplayTrack = z.infer<typeof UpdateDisplayTrackSchema>;

/** Reordenar slides o tracks: lista de ids en el orden deseado. */
export const ReorderSchema = z.object({
  ids: z.array(z.string().uuid()).max(100),
});
export type Reorder = z.infer<typeof ReorderSchema>;

/**
 * Config pública que consume el turnero. Solo elementos ACTIVOS, ya ordenados.
 * Si `slides` viene vacío, el turnero usa su menú por defecto (no se rompe).
 */
export const DisplayBrollConfigSchema = z.object({
  slides: z.array(DisplaySlideSchema),
  tracks: z.array(DisplayTrackSchema),
  asOf: z.string().datetime(),
});
export type DisplayBrollConfig = z.infer<typeof DisplayBrollConfigSchema>;
