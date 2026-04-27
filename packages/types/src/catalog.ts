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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sizes: z.array(ProductSizeSchema).optional(),
  modifiers: z.array(ProductModifierSchema).optional(),
  comboComponents: z.array(ComboComponentSchema).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    basePrice: z.number().nonnegative(),
    category: z.string().max(60).nullable().optional(),
    imageUrl: z.string().url().max(500).nullable().optional(),
    modifiersEnabled: z.boolean().optional(),
    isCombo: z.boolean().optional(),
    comboPrice: z.number().nonnegative().nullable().optional(),
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
  });
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    basePrice: z.number().nonnegative().optional(),
    category: z.string().max(60).nullable().optional(),
    imageUrl: z.string().url().max(500).nullable().optional(),
    modifiersEnabled: z.boolean().optional(),
    isCombo: z.boolean().optional(),
    comboPrice: z.number().nonnegative().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;

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
  childIngredientId: z.string().uuid().nullable(),
  childSubproductId: z.string().uuid().nullable(),
  quantityNeta: z.number(),
  mermaPct: z.number(),
  createdAt: z.string().datetime(),
});
export type RecipeEdge = z.infer<typeof RecipeEdgeSchema>;

export const RecipeResponseSchema = z.object({
  parentType: z.enum(['product', 'subproduct']),
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
});
export type ExpandedIngredientUsage = z.infer<typeof ExpandedIngredientUsageSchema>;

export const ExpandedCostResponseSchema = z.object({
  productId: z.string().uuid(),
  totals: z.array(ExpandedIngredientUsageSchema),
});
export type ExpandedCostResponse = z.infer<typeof ExpandedCostResponseSchema>;
