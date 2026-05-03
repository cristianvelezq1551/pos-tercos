import { z } from 'zod';
import {
  ProductModifierSchema,
  ProductSizeSchema,
} from './catalog';

// ====================================================================
// WEB MENU — endpoint público para el menú online (FASE 7)
// ====================================================================

/**
 * Subset SAFE del producto para exponer públicamente. Excluye:
 *  - lastUnitCost / lastUnitCostDate (info de costos del negocio)
 *  - thresholdMin (info de inventario)
 *  - createdAt / updatedAt (irrelevante para el cliente)
 *  - directResale flag (interno)
 *
 * Incluye: nombre, descripción, precio venta, categoría, imageUrl, sizes,
 * modifiers (si modifiersEnabled).
 */
export const PublicMenuProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  basePrice: z.number().nonnegative(),
  category: z.string().nullable(),
  imageUrl: z.string().nullable(),
  modifiersEnabled: z.boolean(),
  isCombo: z.boolean(),
  comboPrice: z.number().nullable(),
  sizes: z.array(ProductSizeSchema).default([]),
  modifiers: z.array(ProductModifierSchema).default([]),
});
export type PublicMenuProduct = z.infer<typeof PublicMenuProductSchema>;

export const PublicMenuResponseSchema = z.object({
  products: z.array(PublicMenuProductSchema),
  /** Categorías únicas (con orden estable: orden de aparición en products). */
  categories: z.array(z.string()),
  /** Snapshot timestamp para diagnóstico/cache. */
  asOf: z.string().datetime(),
});
export type PublicMenuResponse = z.infer<typeof PublicMenuResponseSchema>;
