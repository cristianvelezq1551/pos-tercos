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
  /** Tamaño de una porción, en `unitRecipe` (ej. 150 = 150 g/porción). Null =
   *  sin porción definida → el inventario solo muestra la unidad nativa. */
  portionSize: z.number().positive().nullable(),
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
  portionSize: z.number().positive().nullable().optional(),
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
  /** Umbral mínimo de stock en `unit`. 0 = sin umbral. */
  thresholdMin: z.number().nonnegative(),
  /** Tamaño de una porción, en `unit`. Null = sin porción definida. */
  portionSize: z.number().positive().nullable(),
  /** Paso a paso de preparación (biblia del cocinero). */
  preparationSteps: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Subproduct = z.infer<typeof SubproductSchema>;

/** Pasos de preparación: lista ordenada, cada paso 1-500 chars, máx 50 pasos. */
export const PreparationStepsSchema = z.array(z.string().trim().min(1).max(500)).max(50);

export const CreateSubproductSchema = z.object({
  name: z.string().min(1).max(120),
  yield: z.number().positive(),
  unit: z.string().min(1).max(20).optional(),
  thresholdMin: z.number().nonnegative().optional(),
  portionSize: z.number().positive().nullable().optional(),
  preparationSteps: PreparationStepsSchema.optional(),
});
export type CreateSubproduct = z.infer<typeof CreateSubproductSchema>;

export const UpdateSubproductSchema = CreateSubproductSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateSubproduct = z.infer<typeof UpdateSubproductSchema>;

/**
 * Registrar producción de un subproducto: cocinero/admin sube N unidades
 * (en `subproduct.unit`) y el sistema consume insumos según receta.
 *
 * - quantityProduced > 0: cantidad final que se va al stock del subproducto.
 * - El backend computa los insumos a consumir como: receta × (qty / yield).
 * - Si algún insumo no tiene stock suficiente, la operación falla (no se
 *   permite stock negativo).
 */
export const RecordProductionSchema = z.object({
  quantityProduced: z.number().positive(),
  notes: z.string().max(500).optional(),
  /** Storage key de la foto de evidencia (subida antes vía /production/evidence). */
  evidenceKey: z.string().max(300).nullable().optional(),
  /** Idempotency-key para reintentos del cliente sin doble producción. */
  idempotencyKey: z.string().min(1).max(100).optional(),
});
export type RecordProduction = z.infer<typeof RecordProductionSchema>;

/** Respuesta de subir la foto de evidencia: la key para pasar a /produce. */
export const ProductionEvidenceUploadSchema = z.object({ key: z.string() });
export type ProductionEvidenceUpload = z.infer<typeof ProductionEvidenceUploadSchema>;

/** Estado de producción de un subproducto para la pantalla de cocina (KDS):
 *  stock actual + umbral + flag "falta producir". Accesible al cocinero. */
export const SubproductProductionStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: z.string(),
  /** Cuántas unidades produce una corrida de la receta (para mostrar "tandas"). */
  yield: z.number().positive(),
  thresholdMin: z.number().nonnegative(),
  currentStock: z.number(),
  /** true si hay umbral y el stock está por debajo → "falta producir". */
  low: z.boolean(),
});
export type SubproductProductionStatus = z.infer<typeof SubproductProductionStatusSchema>;

// ====================================================================
// BIBLIA DE PRODUCTOS — recetario para el cocinero (KDS). Composición
// (qué lleva + cantidades, desde la receta) + paso a paso editable.
// ====================================================================

/** Un ítem de la composición: un insumo o subproducto que entra a la receta. */
export const RecipeComponentSchema = z.object({
  type: z.enum(['INGREDIENT', 'SUBPRODUCT']),
  id: z.string().uuid(),
  name: z.string(),
  /** Cantidad NETA en `unit` (sin merma). */
  quantity: z.number(),
  unit: z.string(),
  /** Merma 0..1 (desperdicio esperado). 0 = sin merma. */
  mermaPct: z.number(),
});
export type RecipeComponent = z.infer<typeof RecipeComponentSchema>;

/** Componente de un combo: otro producto que lo integra. */
export const ComboItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  quantity: z.number(),
});
export type ComboItem = z.infer<typeof ComboItemSchema>;

/** Una entrada de la biblia: un producto o subproducto con su receta + pasos. */
export const RecipeBookEntrySchema = z.object({
  kind: z.enum(['PRODUCT', 'SUBPRODUCT']),
  id: z.string().uuid(),
  name: z.string(),
  /** Categoría (productos). null en subproductos. */
  category: z.string().nullable(),
  /** Imagen (productos). null en subproductos / sin foto. */
  imageUrl: z.string().nullable(),
  description: z.string().nullable(),
  /** Solo productos: true si es combo (su composición va en `comboItems`). */
  isCombo: z.boolean(),
  /** Solo subproductos: cuántas unidades rinde una corrida de la receta. */
  yield: z.number().nullable(),
  /** Unidad del subproducto (subproductos). null en productos. */
  unit: z.string().nullable(),
  /** Insumos + subproductos directos de la receta. */
  components: z.array(RecipeComponentSchema),
  /** Solo combos: productos que lo integran. */
  comboItems: z.array(ComboItemSchema),
  preparationSteps: z.array(z.string()),
});
export type RecipeBookEntry = z.infer<typeof RecipeBookEntrySchema>;

export const RecipeBookResponseSchema = z.object({
  products: z.array(RecipeBookEntrySchema),
  subproducts: z.array(RecipeBookEntrySchema),
  asOf: z.string().datetime(),
});
export type RecipeBookResponse = z.infer<typeof RecipeBookResponseSchema>;

/** Respuesta al producir: detalle del movement creado + insumos/sub-subproductos
 *  consumidos. Cada item está discriminado por entityType para evitar confundir
 *  ingredientes con sub-subproductos. */
export const ProductionRunSchema = z.object({
  runId: z.string().uuid(),
  subproductId: z.string().uuid(),
  subproductName: z.string(),
  quantityProduced: z.number().positive(),
  unit: z.string(),
  consumed: z.array(
    z.object({
      /** 'INGREDIENT' o 'SUBPRODUCT' (sub-subproductos también se consumen). */
      entityType: z.enum(['INGREDIENT', 'SUBPRODUCT']),
      /** ID del insumo o subproducto consumido. */
      entityId: z.string().uuid(),
      name: z.string(),
      quantityConsumed: z.number().positive(),
      unit: z.string(),
    }),
  ),
  /** Ruta para ver la foto de evidencia (null si no se subió). */
  evidenceUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type ProductionRun = z.infer<typeof ProductionRunSchema>;

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

/**
 * Consumo de inventario de un modificador: qué descuenta del stock cada
 * unidad vendida con este extra (ej. "Doble carne" → +150g de carne).
 * `quantity` está en la unidad de RECETA del child y es bruta (sin merma).
 */
export const ModifierConsumptionSchema = z.object({
  childType: z.enum(['ingredient', 'subproduct']),
  childId: z.string().uuid(),
  quantity: z.number().positive(),
});
export type ModifierConsumption = z.infer<typeof ModifierConsumptionSchema>;

/** Lista de consumos del modificador (persistida en product_modifiers.recipe_delta). */
export const ModifierRecipeDeltaSchema = z.array(ModifierConsumptionSchema).max(5);
export type ModifierRecipeDelta = z.infer<typeof ModifierRecipeDeltaSchema>;

export const ProductModifierSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string(),
  priceDelta: z.number(),
  recipeDelta: ModifierRecipeDeltaSchema,
});
export type ProductModifier = z.infer<typeof ProductModifierSchema>;

export const ProductModifierInputSchema = z.object({
  name: z.string().min(1).max(60),
  priceDelta: z.number(),
  recipeDelta: ModifierRecipeDeltaSchema.optional(),
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
  /** Paso a paso de preparación (biblia del cocinero). */
  preparationSteps: z.array(z.string()),
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
    preparationSteps: PreparationStepsSchema.optional(),
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
    preparationSteps: PreparationStepsSchema.optional(),
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
  /** Fecha del último costo de compra del insumo. Para señalar costo viejo/volátil. */
  lastUnitCostDate: z.string().datetime().nullable(),
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

/** Componente DIRECTO (un nivel) de la receta: insumo o subproducto que se
 *  consume tal cual al vender 1 unidad — espeja cómo el FIFO descuenta. Para
 *  productos con subproductos, acá aparece el SUBPRODUCTO (no sus insumos
 *  profundos), a diferencia de `totals` que aplana hasta insumos. */
export const DirectRecipeComponentSchema = z.object({
  entityType: z.enum(['INGREDIENT', 'SUBPRODUCT']),
  id: z.string().uuid(),
  name: z.string(),
  /** Unidad base (unitRecipe del insumo / unit del subproducto). */
  unitRecipe: z.string(),
  /** Cantidad bruta por 1 unidad del producto/subproducto (un nivel, con merma). */
  totalQuantity: z.number(),
});
export type DirectRecipeComponent = z.infer<typeof DirectRecipeComponentSchema>;

export const ExpandedCostResponseSchema = z.object({
  productId: z.string().uuid(),
  /** 'product' | 'combo' — para que la UI sepa cómo renderear. */
  kind: z.enum(['product', 'combo']),
  totals: z.array(ExpandedIngredientUsageSchema),
  /** Componentes DIRECTOS (un nivel) — para el rendimiento FIFO por componente. */
  directComponents: z.array(DirectRecipeComponentSchema),
  /** Solo poblado cuando kind='combo'. Vacío para productos. */
  components: z.array(ComboComponentCostSchema),
  /** Costo total estimado del producto. Null si falta info en algún componente/ingrediente. */
  totalCost: z.number().nullable(),
  /** Si totalCost es null, lista los faltantes para que la UI muestre tooltip. */
  missingReasons: z.array(z.string()),
});
export type ExpandedCostResponse = z.infer<typeof ExpandedCostResponseSchema>;

/** Costo por unidad de cada subproducto (resumen batch, sin N+1). */
export const SubproductCostSummarySchema = z.object({
  subproductId: z.string().uuid(),
  /** Costo estimado por 1 unidad del subproducto. Null si falta costo de algún insumo. */
  totalCost: z.number().nullable(),
});
export type SubproductCostSummary = z.infer<typeof SubproductCostSummarySchema>;

/** Costo por unidad de cada producto (resumen batch para la tabla de productos, sin N+1). */
export const ProductCostSummarySchema = z.object({
  productId: z.string().uuid(),
  /** Costo estimado por 1 unidad. Null si falta costo de algún insumo/componente. */
  totalCost: z.number().nullable(),
  /** Motivos por los que el costo quedó incompleto (insumos sin costo, etc.). */
  missingReasons: z.array(z.string()),
});
export type ProductCostSummary = z.infer<typeof ProductCostSummarySchema>;
