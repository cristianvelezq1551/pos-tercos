import { z } from 'zod';

export const InventoryMovementTypeEnum = z.enum([
  'PURCHASE',
  'SALE',
  'MANUAL_ADJUSTMENT',
  'WASTE',
  'INITIAL',
  /** Tanda de producción interna: +N en subproducto, -receta en insumos. */
  'PRODUCTION',
]);
export type InventoryMovementType = z.infer<typeof InventoryMovementTypeEnum>;

/**
 * Discriminador para entidades stock-trackeables.
 * - INGREDIENT: insumo (Ingredient)
 * - PRODUCT: producto direct-resale (Product con directResale=true)
 * - SUBPRODUCT: subproducto pre-producido (con stock propio, no se expande
 *   recursivamente al venderse)
 */
export const StockableTypeEnum = z.enum(['INGREDIENT', 'PRODUCT', 'SUBPRODUCT']);
export type StockableType = z.infer<typeof StockableTypeEnum>;

export const InventoryMovementSchema = z.object({
  id: z.string().uuid(),
  entityType: StockableTypeEnum,
  ingredientId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  subproductId: z.string().uuid().nullable(),
  /** Nombre del item (ingredient.name o product.name o subproduct.name) — server lo embebe. */
  itemName: z.string().optional(),
  delta: z.number(),
  /** Costo por unidad de stock (solo entradas). Base del costeo FIFO. */
  unitCost: z.number().nullable().optional(),
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
    subproductId: z.string().uuid().optional(),
    delta: z.number().refine((v) => v !== 0, { message: 'delta must not be zero' }),
    type: z.enum(['MANUAL_ADJUSTMENT', 'WASTE', 'INITIAL']).default('MANUAL_ADJUSTMENT'),
    /** Costo por unidad de stock para entradas (INITIAL / ajuste+). Base FIFO. */
    unitCost: z.number().nonnegative().nullable().optional(),
    notes: z.string().max(500).optional(),
    idempotencyKey: z.string().min(1).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const expected =
      data.entityType === 'INGREDIENT' ? 'ingredientId'
      : data.entityType === 'PRODUCT' ? 'productId'
      : 'subproductId';
    const provided = (
      ['ingredientId', 'productId', 'subproductId'] as const
    ).filter((k) => data[k] !== undefined);
    if (!data[expected]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${expected} required when entityType=${data.entityType}`,
        path: [expected],
      });
    }
    for (const k of provided) {
      if (k !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${k} must be omitted when entityType=${data.entityType}`,
          path: [k],
        });
      }
    }
  });
export type CreateInventoryMovement = z.infer<typeof CreateInventoryMovementSchema>;

/**
 * Vista unificada de stock — incluye insumos, productos direct-resale y
 * subproductos (producción interna). El frontend muestra los 3 en la misma
 * tabla distinguidos por `type`.
 *
 * Para SUBPRODUCT: unitPurchase = unitStock = subproduct.unit (no se compra,
 * se produce), conversionFactor = 1.
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
  // Específicos del Producto direct-resale (null en insumos y subproductos):
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

// ====================================================================
// CONTEO FÍSICO CICLADO — contado vs ledger + ajuste compensatorio
// ====================================================================

export const CreateStockCountSchema = z
  .object({
    entityType: StockableTypeEnum,
    ingredientId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    subproductId: z.string().uuid().optional(),
    /** Cantidad física contada, en unidad de stock/receta. */
    countedQty: z.number().nonnegative(),
    notes: z.string().max(300).optional(),
  })
  .superRefine((data, ctx) => {
    const expected =
      data.entityType === 'INGREDIENT' ? 'ingredientId'
      : data.entityType === 'PRODUCT' ? 'productId'
      : 'subproductId';
    if (!data[expected]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${expected} es requerido cuando entityType=${data.entityType}`,
        path: [expected],
      });
    }
  });
export type CreateStockCount = z.infer<typeof CreateStockCountSchema>;

export const StockCountSchema = z.object({
  id: z.string().uuid(),
  entityType: StockableTypeEnum,
  entityId: z.string().uuid(),
  name: z.string(),
  countedQty: z.number(),
  ledgerQty: z.number(),
  difference: z.number(),
  userId: z.string().uuid().nullable(),
  userName: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type StockCount = z.infer<typeof StockCountSchema>;

/** Tarea de conteo sugerida para hoy (rotación cíclica). */
export const CountTaskSchema = z.object({
  entityType: StockableTypeEnum,
  entityId: z.string().uuid(),
  name: z.string(),
  unit: z.string(),
  /** Stock según el ledger AHORA. La UI lo oculta hasta registrar (conteo ciego). */
  ledgerQty: z.number(),
  /** Último conteo registrado. Null = nunca contado (máxima prioridad). */
  lastCountedAt: z.string().datetime().nullable(),
});
export type CountTask = z.infer<typeof CountTaskSchema>;
