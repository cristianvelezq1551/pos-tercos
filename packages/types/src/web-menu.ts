import { z } from 'zod';
import { ProductSizeSchema } from './catalog';
import { PromotionTypeEnum } from './promotions';

// ====================================================================
// WEB MENU — endpoint público para el menú online (FASE 7)
// ====================================================================

/**
 * Modificador expuesto públicamente. NO incluye `recipeDelta`: la composición
 * de receta (qué insumos/subproductos consume el modificador) es información
 * interna del negocio y nunca debe viajar en el menú público.
 */
export const PublicMenuModifierSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string(),
  priceDelta: z.number(),
});
export type PublicMenuModifier = z.infer<typeof PublicMenuModifierSchema>;

/**
 * Subset SAFE del producto para exponer públicamente. Excluye:
 *  - lastUnitCost / lastUnitCostDate (info de costos del negocio)
 *  - thresholdMin (info de inventario)
 *  - createdAt / updatedAt (irrelevante para el cliente)
 *  - directResale flag (interno)
 *  - recipeDelta de los modificadores (composición de receta interna)
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
  modifiers: z.array(PublicMenuModifierSchema).default([]),
});
export type PublicMenuProduct = z.infer<typeof PublicMenuProductSchema>;

/**
 * Promoción activa expuesta en el menú público (solo canal WEB/BOTH).
 * Subset SAFE: definición necesaria para que el cliente calcule el precio
 * con descuento (mismo motor `applyPromotion` de domain que usa el POS).
 * NO incluye createdBy ni metadata interna.
 */
export const PublicMenuPromotionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: PromotionTypeEnum,
  discountPct: z.number().min(0).lt(1).nullable(),
  discountFixed: z.number().min(0).nullable(),
  bogoBuyQty: z.number().int().min(1).nullable(),
  bogoGetQty: z.number().int().min(1).nullable(),
  daysOfWeekMask: z.number().int().min(1).max(127),
  timeStart: z.string(),
  timeEnd: z.string(),
  activeFrom: z.string().date().nullable(),
  activeTo: z.string().date().nullable(),
  productIds: z.array(z.string().uuid()),
});
export type PublicMenuPromotion = z.infer<typeof PublicMenuPromotionSchema>;

export const PublicMenuResponseSchema = z.object({
  products: z.array(PublicMenuProductSchema),
  /** Promos activas del canal web, para tachados/badges en el menú. */
  promotions: z.array(PublicMenuPromotionSchema).default([]),
  /** Categorías únicas (con orden estable: orden de aparición en products). */
  categories: z.array(z.string()),
  /** Kill-switch (#13): false = la web muestra el menú pero oculta el checkout. */
  webOrdersEnabled: z.boolean().default(true),
  /** Snapshot timestamp para diagnóstico/cache. */
  asOf: z.string().datetime(),
});
export type PublicMenuResponse = z.infer<typeof PublicMenuResponseSchema>;
