import { z } from 'zod';

export const InventoryMovementTypeEnum = z.enum([
  'PURCHASE',
  'SALE',
  'MANUAL_ADJUSTMENT',
  'WASTE',
  'INITIAL',
]);
export type InventoryMovementType = z.infer<typeof InventoryMovementTypeEnum>;

export const InventoryMovementSchema = z.object({
  id: z.string().uuid(),
  ingredientId: z.string().uuid(),
  ingredientName: z.string().optional(),
  delta: z.number(),
  type: InventoryMovementTypeEnum,
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  userId: z.string().uuid().nullable(),
  userFullName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;

/**
 * Manual adjustments by Admin/Dueño. Type defaults to MANUAL_ADJUSTMENT;
 * INITIAL is allowed for the very first stock load.
 */
export const CreateInventoryMovementSchema = z
  .object({
    ingredientId: z.string().uuid(),
    delta: z.number().refine((v) => v !== 0, { message: 'delta must not be zero' }),
    type: z.enum(['MANUAL_ADJUSTMENT', 'WASTE', 'INITIAL']).default('MANUAL_ADJUSTMENT'),
    notes: z.string().max(500).optional(),
    idempotencyKey: z.string().min(1).max(100).optional(),
  });
export type CreateInventoryMovement = z.infer<typeof CreateInventoryMovementSchema>;

export const IngredientWithStockSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unitPurchase: z.string(),
  unitRecipe: z.string(),
  conversionFactor: z.number().positive(),
  thresholdMin: z.number().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  currentStock: z.number(),
  lowStock: z.boolean(),
});
export type IngredientWithStock = z.infer<typeof IngredientWithStockSchema>;
