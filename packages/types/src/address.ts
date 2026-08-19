import { z } from 'zod';

/** Una opción del autocompletado; todavía sin coordenadas. */
export const AddressSuggestionSchema = z.object({
  id: z.string(),
  description: z.string(),
});
export type AddressSuggestion = z.infer<typeof AddressSuggestionSchema>;

export const AddressSuggestResponseSchema = z.object({
  suggestions: z.array(AddressSuggestionSchema),
});
export type AddressSuggestResponse = z.infer<typeof AddressSuggestResponseSchema>;

export const ResolveAddressSchema = z.object({
  suggestionId: z.string().min(1).max(500),
  /**
   * Agrupa el tipeo + la elección en una sola sesión de facturación de Google.
   * Sin esto, cada tecla se cobra como búsqueda suelta.
   */
  sessionToken: z.string().max(100).optional(),
});
export type ResolveAddress = z.infer<typeof ResolveAddressSchema>;

/**
 * Dirección ya resuelta por el SERVER, con el veredicto de cobertura.
 *
 * `addressToken` es el sobre firmado con las coordenadas: el navegador lo
 * transporta hasta el pedido pero no lo puede alterar. Sin esa firma el
 * candado de la zona no existiría — bastaría con editar el lat/lng del body.
 */
export const ResolvedAddressSchema = z.object({
  formatted: z.string(),
  lat: z.number(),
  lng: z.number(),
  precision: z.enum(['exact', 'interpolated', 'approximate']),
  inRange: z.boolean(),
  /** null cuando no se pudo medir (el local no tiene coordenadas cargadas). */
  distanceKm: z.number().nullable(),
  radiusKm: z.number(),
  addressToken: z.string(),
});
export type ResolvedAddressResponse = z.infer<typeof ResolvedAddressSchema>;
