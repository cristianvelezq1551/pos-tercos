import { z } from 'zod';
import { StockableTypeEnum } from './inventory';

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  nit: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const CreateSupplierSchema = z.object({
  nit: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(120).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = CreateSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;

/**
 * SupplierProduct polimórfico (FASE 4 ajustes 2.8): apunta a INGREDIENT
 * o PRODUCT (direct-resale) según `entityType`. Espejo del schema DB
 * donde `ingredient_id` xor `product_id` está enforced por CHECK.
 *
 * Reusa StockableTypeEnum de `./inventory` (ya existía).
 */
export const SupplierProductSchema = z
  .object({
    id: z.string().uuid(),
    supplierId: z.string().uuid(),
    entityType: StockableTypeEnum,
    ingredientId: z.string().uuid().nullable(),
    productId: z.string().uuid().nullable(),
    /** Nombre del item (ingrediente o producto) — populado por el endpoint. */
    name: z.string().optional(),
    lastUnitPrice: z.number().nullable(),
    lastPurchaseDate: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .refine(
    (d) =>
      (d.entityType === 'INGREDIENT' && d.ingredientId !== null && d.productId === null) ||
      (d.entityType === 'PRODUCT' && d.productId !== null && d.ingredientId === null),
    'El tipo de item no coincide con el item enviado.',
  );
export type SupplierProduct = z.infer<typeof SupplierProductSchema>;
