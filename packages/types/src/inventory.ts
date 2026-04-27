import { z } from 'zod';

export const InventoryMovementTypeEnum = z.enum([
  'PURCHASE',
  'SALE',
  'MANUAL_ADJUSTMENT',
  'WASTE',
  'INITIAL',
]);
export type InventoryMovementType = z.infer<typeof InventoryMovementTypeEnum>;

/**
 * Discriminador para entidades stock-trackeables.
 * - INGREDIENT: insumo (Ingredient)
 * - PRODUCT: producto direct-resale (Product con directResale=true)
 */
export const StockableTypeEnum = z.enum(['INGREDIENT', 'PRODUCT']);
export type StockableType = z.infer<typeof StockableTypeEnum>;

export const InventoryMovementSchema = z.object({
  id: z.string().uuid(),
  entityType: StockableTypeEnum,
  ingredientId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  /** Nombre del item (ingredient.name o product.name) — server lo embebe. */
  itemName: z.string().optional(),
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
 * Manual adjustments by Admin/Dueño. Acepta un solo target via
 * entityType + ingredientId XOR productId.
 */
export const CreateInventoryMovementSchema = z
  .object({
    entityType: StockableTypeEnum,
    ingredientId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    delta: z.number().refine((v) => v !== 0, { message: 'delta must not be zero' }),
    type: z.enum(['MANUAL_ADJUSTMENT', 'WASTE', 'INITIAL']).default('MANUAL_ADJUSTMENT'),
    notes: z.string().max(500).optional(),
    idempotencyKey: z.string().min(1).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === 'INGREDIENT') {
      if (!data.ingredientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ingredientId required when entityType=INGREDIENT',
          path: ['ingredientId'],
        });
      }
      if (data.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'productId must be omitted when entityType=INGREDIENT',
          path: ['productId'],
        });
      }
    }
    if (data.entityType === 'PRODUCT') {
      if (!data.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'productId required when entityType=PRODUCT',
          path: ['productId'],
        });
      }
      if (data.ingredientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ingredientId must be omitted when entityType=PRODUCT',
          path: ['ingredientId'],
        });
      }
    }
  });
export type CreateInventoryMovement = z.infer<typeof CreateInventoryMovementSchema>;

/**
 * Vista unificada de stock — incluye insumos Y productos direct-resale.
 * El frontend muestra ambos en la misma tabla distinguidos por `type`.
 */
export const StockableSchema = z.object({
  type: StockableTypeEnum,
  id: z.string().uuid(),
  name: z.string(),
  unitStock: z.string(),
  unitPurchase: z.string(),
  conversionFactor: z.number().positive(),
  thresholdMin: z.number().nonnegative(),
  currentStock: z.number(),
  lowStock: z.boolean(),
  isActive: z.boolean(),
  // Específicos del Producto direct-resale (null en insumos):
  category: z.string().nullable().optional(),
  basePrice: z.number().nullable().optional(),
});
export type Stockable = z.infer<typeof StockableSchema>;

// Legacy compat: solo para insumos. Mantenido para no romper /inventory existente
// si alguien lo consume. Nuevos consumidores deben usar StockableSchema.
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
