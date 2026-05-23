import { z } from 'zod';

// ====================================================================
// INGREDIENTS
// ====================================================================

export const IngredientSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unitPurchase: z.string(),
  unitRecipe: z.string(),
  conversionFactor: z.number().positive(),
  thresholdMin: z.number().nonnegative(),
  // Costo histórico (FASE 4 ajustes 2.2). En unitPurchase. Auto-actualizado
  // al confirmar facturas (espejo de Product.lastUnitCost).
  lastUnitCost: z.number().nullable(),
  lastUnitCostDate: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const CreateIngredientSchema = z.object({
  name: z.string().min(1).max(120),
  unitPurchase: z.string().min(1).max(20),
  unitRecipe: z.string().min(1).max(20),
  conversionFactor: z.number().positive(),
  thresholdMin: z.number().nonnegative().optional(),
});
export type CreateIngredient = z.infer<typeof CreateIngredientSchema>;

export const UpdateIngredientSchema = CreateIngredientSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateIngredient = z.infer<typeof UpdateIngredientSchema>;

// ====================================================================
// SUBPRODUCTS
// ====================================================================

export const SubproductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  yield: z.number().positive(),
  unit: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Subproduct = z.infer<typeof SubproductSchema>;

export const CreateSubproductSchema = z.object({
  name: z.string().min(1).max(120),
  yield: z.number().positive(),
  unit: z.string().min(1).max(20).optional(),
});
export type CreateSubproduct = z.infer<typeof CreateSubproductSchema>;

export const UpdateSubproductSchema = CreateSubproductSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateSubproduct = z.infer<typeof UpdateSubproductSchema>;

// ====================================================================
// PRODUCTS (incluye sizes, modifiers, combo components)
// ====================================================================

export const ProductSizeSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string(),
  priceModifier: z.number(),
  sortOrder: z.number().int(),
});
export type ProductSize = z.infer<typeof ProductSizeSchema>;

export const ProductSizeInputSchema = z.object({
  name: z.string().min(1).max(40),
  priceModifier: z.number(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type ProductSizeInput = z.infer<typeof ProductSizeInputSchema>;

export const ProductModifierSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string(),
  priceDelta: z.number(),
  recipeDelta: z.unknown(),
});
export type ProductModifier = z.infer<typeof ProductModifierSchema>;

export const ProductModifierInputSchema = z.object({
  name: z.string().min(1).max(60),
  priceDelta: z.number(),
  recipeDelta: z.unknown().optional(),
});
export type ProductModifierInput = z.infer<typeof ProductModifierInputSchema>;

export const ComboComponentSchema = z.object({
  id: z.string().uuid(),
  comboId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});
export type ComboComponent = z.infer<typeof ComboComponentSchema>;

export const ComboComponentInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});
export type ComboComponentInput = z.infer<typeof ComboComponentInputSchema>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  basePrice: z.number().nonnegative(),
  category: z.string().nullable(),
  imageUrl: z.string().nullable(),
  modifiersEnabled: z.boolean(),
  isCombo: z.boolean(),
  comboPrice: z.number().nullable(),
  isActive: z.boolean(),
  /** "86" manual: agotado, no vendible (cajero + web) sin tocar el catálogo. */
  soldOut: z.boolean(),
  // Direct-resale fields (FASE 4 refactor)
  directResale: z.boolean(),
  unitPurchase: z.string().nullable(),
  unitStock: z.string().nullable(),
  conversionFactor: z.number().nullable(),
  thresholdMin: z.number().nonnegative(),
  // Costo histórico (auto-actualizado al confirmar facturas).
  // ⚠️ NO confundir con basePrice (precio de VENTA al cliente).
  // lastUnitCost está en unit_purchase del producto (ej: $/caja).
  lastUnitCost: z.number().nullable(),
  lastUnitCostDate: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sizes: z.array(ProductSizeSchema).optional(),
  modifiers: z.array(ProductModifierSchema).optional(),
  comboComponents: z.array(ComboComponentSchema).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

const ProductImageUrlSchema = z
  .string()
  .max(500)
  .refine(
    (v) => v === '' || /^https?:\/\//i.test(v) || v.startsWith('/'),
    { message: 'imageUrl debe ser una URL absoluta o un path relativo a /' },
  );

export const CreateProductSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    basePrice: z.number().nonnegative(),
    category: z.string().max(60).nullable().optional(),
    imageUrl: ProductImageUrlSchema.nullable().optional(),
    modifiersEnabled: z.boolean().optional(),
    isCombo: z.boolean().optional(),
    comboPrice: z.number().nonnegative().nullable().optional(),
    // Direct-resale fields. Si directResale=true → los 3 (unitPurchase,
    // unitStock, conversionFactor) son requeridos.
    directResale: z.boolean().optional(),
    unitPurchase: z.string().min(1).max(20).optional(),
    unitStock: z.string().min(1).max(20).optional(),
    conversionFactor: z.number().positive().optional(),
    thresholdMin: z.number().nonnegative().optional(),
    sizes: z.array(ProductSizeInputSchema).optional(),
    modifiers: z.array(ProductModifierInputSchema).optional(),
    comboComponents: z.array(ComboComponentInputSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isCombo && (data.comboPrice === undefined || data.comboPrice === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'comboPrice is required when isCombo is true',
        path: ['comboPrice'],
      });
    }
    if (!data.isCombo && data.comboPrice !== undefined && data.comboPrice !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'comboPrice must be null/omitted when isCombo is false',
        path: ['comboPrice'],
      });
    }
    if (data.directResale) {
      if (!data.unitPurchase) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'unitPurchase required when directResale=true',
          path: ['unitPurchase'],
        });
      }
      if (!data.unitStock) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'unitStock required when directResale=true',
          path: ['unitStock'],
        });
      }
      if (data.conversionFactor === undefined || data.conversionFactor === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'conversionFactor required when directResale=true',
          path: ['conversionFactor'],
        });
      }
      if (data.isCombo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'directResale and isCombo cannot both be true',
          path: ['directResale'],
        });
      }
    }
  });
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    basePrice: z.number().nonnegative().optional(),
    category: z.string().max(60).nullable().optional(),
    imageUrl: ProductImageUrlSchema.nullable().optional(),
    modifiersEnabled: z.boolean().optional(),
    isCombo: z.boolean().optional(),
    comboPrice: z.number().nonnegative().nullable().optional(),
    isActive: z.boolean().optional(),
    directResale: z.boolean().optional(),
    unitPurchase: z.string().min(1).max(20).nullable().optional(),
    unitStock: z.string().min(1).max(20).nullable().optional(),
    conversionFactor: z.number().positive().nullable().optional(),
    thresholdMin: z.number().nonnegative().optional(),
  })
  .strict();
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;

// ====================================================================
// EDICIÓN DE OPCIONES (variantes + extras) Y COMBO — replace semantics
// ====================================================================

/** Variante en edición: `id` presente = existente (se actualiza); ausente = nueva. */
export const ProductSizeEditSchema = ProductSizeInputSchema.extend({
  id: z.string().uuid().optional(),
});
export type ProductSizeEdit = z.infer<typeof ProductSizeEditSchema>;

/** PUT /products/:id/options — reemplaza variantes + extras del producto. */
export const SetProductOptionsSchema = z.object({
  sizes: z.array(ProductSizeEditSchema),
  modifiers: z.array(ProductModifierInputSchema),
});
export type SetProductOptions = z.infer<typeof SetProductOptionsSchema>;

/** PUT /products/:id/combo — reemplaza los componentes de un combo. */
export const SetComboComponentsSchema = z.object({
  components: z.array(ComboComponentInputSchema).min(1),
});
export type SetComboComponents = z.infer<typeof SetComboComponentsSchema>;

// ====================================================================
// DISPONIBILIDAD / STOCK EN TIEMPO REAL
// ====================================================================

/** Disponibilidad de un producto para vender (cajero + web). */
export const ProductAvailabilitySchema = z.object({
  productId: z.string().uuid(),
  /**
   * false = agotado (manual), reventa sin stock, o preparado/combo sin insumos
   * suficientes para 1 unidad → invalidado en la UI.
   */
  available: z.boolean(),
  /** Stock real solo para reventa directa (bebidas); null para preparados/combos. */
  stock: z.number().nullable(),
  /**
   * Motivo de no-disponibilidad para UI interna (cajero/admin). Null si está
   * disponible. Ej: "Sin Pan de hamburguesa", "Agotado (manual)", "Sin stock".
   * No se expone al cliente final (web muestra solo "Agotado").
   */
  reason: z.string().nullable(),
});
export type ProductAvailability = z.infer<typeof ProductAvailabilitySchema>;

export const ProductAvailabilityResponseSchema = z.array(ProductAvailabilitySchema);

/** POST /products/:id/sold-out — marca/desmarca agotado (86). */
export const SetSoldOutSchema = z.object({ soldOut: z.boolean() });
export type SetSoldOut = z.infer<typeof SetSoldOutSchema>;

// ====================================================================
// RECIPES
// ====================================================================

export const RecipeEdgeChildSchema = z.discriminatedUnion('childType', [
  z.object({
    childType: z.literal('ingredient'),
    childId: z.string().uuid(),
  }),
  z.object({
    childType: z.literal('subproduct'),
    childId: z.string().uuid(),
  }),
]);
export type RecipeEdgeChild = z.infer<typeof RecipeEdgeChildSchema>;

export const RecipeEdgeInputSchema = z.intersection(
  RecipeEdgeChildSchema,
  z.object({
    quantityNeta: z.number().positive(),
    mermaPct: z.number().min(0).lt(1).optional(),
  }),
);
export type RecipeEdgeInput = z.infer<typeof RecipeEdgeInputSchema>;

export const SetRecipeRequestSchema = z.object({
  edges: z.array(RecipeEdgeInputSchema),
});
export type SetRecipeRequest = z.infer<typeof SetRecipeRequestSchema>;

export const RecipeEdgeSchema = z.object({
  id: z.string().uuid(),
  parentProductId: z.string().uuid().nullable(),
  parentSubproductId: z.string().uuid().nullable(),
  /** Receta por variante (proteína). Aditiva sobre la receta base del producto. */
  parentSizeId: z.string().uuid().nullable(),
  childIngredientId: z.string().uuid().nullable(),
  childSubproductId: z.string().uuid().nullable(),
  quantityNeta: z.number(),
  mermaPct: z.number(),
  createdAt: z.string().datetime(),
});
export type RecipeEdge = z.infer<typeof RecipeEdgeSchema>;

export const RecipeResponseSchema = z.object({
  parentType: z.enum(['product', 'subproduct', 'size']),
  parentId: z.string().uuid(),
  edges: z.array(RecipeEdgeSchema),
});
export type RecipeResponse = z.infer<typeof RecipeResponseSchema>;

// ====================================================================
// EXPANDED COST
// ====================================================================

export const ExpandedIngredientUsageSchema = z.object({
  ingredientId: z.string().uuid(),
  name: z.string(),
  unitRecipe: z.string(),
  totalQuantity: z.number(),
  /** Costo del ingrediente por unidad de receta (lastUnitCost / conversionFactor). */
  unitCostInRecipe: z.number().nullable(),
  /** Aporte al costo total = totalQuantity × unitCostInRecipe. Null si falta cost. */
  costContribution: z.number().nullable(),
});
export type ExpandedIngredientUsage = z.infer<typeof ExpandedIngredientUsageSchema>;

/**
 * Detalle por componente cuando el producto es un combo. Cada componente
 * resuelve su costo via la misma lógica recursiva (directResale | recipe).
 */
export const ComboComponentCostSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  /** Costo unitario del componente (igual modelo que un producto solo). */
  unitCost: z.number().nullable(),
  /** Aporte al costo del combo = quantity × unitCost. */
  costContribution: z.number().nullable(),
  /** Si null, explica por qué (ej. "ingrediente sin lastUnitCost"). */
  missingReason: z.string().nullable(),
});
export type ComboComponentCost = z.infer<typeof ComboComponentCostSchema>;

export const ExpandedCostResponseSchema = z.object({
  productId: z.string().uuid(),
  /** 'product' | 'combo' — para que la UI sepa cómo renderear. */
  kind: z.enum(['product', 'combo']),
  totals: z.array(ExpandedIngredientUsageSchema),
  /** Solo poblado cuando kind='combo'. Vacío para productos. */
  components: z.array(ComboComponentCostSchema),
  /** Costo total estimado del producto. Null si falta info en algún componente/ingrediente. */
  totalCost: z.number().nullable(),
  /** Si totalCost es null, lista los faltantes para que la UI muestre tooltip. */
  missingReasons: z.array(z.string()),
});
export type ExpandedCostResponse = z.infer<typeof ExpandedCostResponseSchema>;
