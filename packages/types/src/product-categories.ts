import { z } from 'zod';

// ====================================================================
// PRODUCT CATEGORIES — catálogo curado de categorías de producto.
// Fuente de verdad del selector del admin (evita duplicados por tipeo).
// ====================================================================

export const ProductCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  /** Cuántos productos usan esta categoría (para bloquear el borrado). */
  productCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

const CategoryNameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre no puede estar vacío')
  .max(60, 'Máx 60 caracteres');

export const CreateProductCategorySchema = z.object({
  name: CategoryNameSchema,
  sortOrder: z.number().int().nonnegative().optional(),
});
export type CreateProductCategory = z.infer<typeof CreateProductCategorySchema>;

export const UpdateProductCategorySchema = z
  .object({
    name: CategoryNameSchema.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateProductCategory = z.infer<typeof UpdateProductCategorySchema>;
