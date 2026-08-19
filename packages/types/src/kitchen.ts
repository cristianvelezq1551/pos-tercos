import { z } from 'zod';
import { StockableTypeEnum, STOCKABLE_TYPE_LABELS } from './inventory';

// ====================================================================
// COCINA (app del cocinero) — merma, conteo ciego, incidencias, checklist
// El stock se expone con `Stockable[]` (ya sin costos). La producción y la
// biblia reutilizan los endpoints existentes (/subproducts, /recipe-book).
// ====================================================================

/** Selector polimórfico de un stockable (insumo / producto reventa / subproducto). */
const StockableRefShape = {
  entityType: StockableTypeEnum,
  ingredientId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  subproductId: z.string().uuid().optional(),
};

function requireMatchingId(
  data: { entityType: z.infer<typeof StockableTypeEnum>; ingredientId?: string; productId?: string; subproductId?: string },
  ctx: z.RefinementCtx,
): void {
  const expected =
    data.entityType === 'INGREDIENT' ? 'ingredientId'
    : data.entityType === 'PRODUCT' ? 'productId'
    : 'subproductId';
  if (!data[expected]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Falta indicar a qué ${STOCKABLE_TYPE_LABELS[data.entityType]} corresponde.`,
      path: [expected],
    });
  }
}

// ── Merma / desperdicio ──────────────────────────────────────────────

export const RegisterWasteSchema = z
  .object({
    ...StockableRefShape,
    /** Cantidad descartada (positiva, en unidad de stock). Se registra como WASTE negativo. */
    quantity: z.number().positive(),
    /** Motivo obligatorio (auditable): "se quemó", "vencido", "se cayó", etc. */
    reason: z.string().min(3).max(300),
    /** §3.3: idempotencia — un reintento tras respuesta perdida NO registra una
     *  segunda merma (movements insert-only → sería doble descuento). */
    idempotencyKey: z.string().uuid().optional(),
  })
  .superRefine(requireMatchingId);
export type RegisterWaste = z.infer<typeof RegisterWasteSchema>;

// ── Conteo físico ciego (batch) ──────────────────────────────────────

export const KitchenCountItemSchema = z
  .object({
    ...StockableRefShape,
    /** Cantidad física contada (en unidad de stock). */
    countedQty: z.number().nonnegative(),
  })
  .superRefine(requireMatchingId);
export type KitchenCountItem = z.infer<typeof KitchenCountItemSchema>;

export const KitchenCountSchema = z.object({
  items: z.array(KitchenCountItemSchema).min(1).max(200),
  notes: z.string().max(300).optional(),
});
export type KitchenCount = z.infer<typeof KitchenCountSchema>;

/** Resultado del conteo: cuántos ítems se ajustaron (sin revelar el esperado → ciego). */
export const KitchenCountResultSchema = z.object({
  counted: z.number().int().nonnegative(),
  adjusted: z.number().int().nonnegative(),
});
export type KitchenCountResult = z.infer<typeof KitchenCountResultSchema>;

// ── Bitácora de incidencias ──────────────────────────────────────────

export const KitchenIncidentCategoryEnum = z.enum([
  'INSUMO', // insumo/ingrediente en mal estado
  'EQUIPO', // equipo / máquina
  'PRODUCCION', // problema de producción (tanda perdida, etc.)
  'OTRO',
]);
export type KitchenIncidentCategory = z.infer<typeof KitchenIncidentCategoryEnum>;

export const KITCHEN_INCIDENT_CATEGORY_LABELS: Record<KitchenIncidentCategory, string> = {
  INSUMO: 'Insumo en mal estado',
  EQUIPO: 'Equipo / máquina',
  PRODUCCION: 'Producción',
  OTRO: 'Otro',
};

export const CreateKitchenIncidentSchema = z.object({
  category: KitchenIncidentCategoryEnum,
  note: z.string().min(3).max(1000),
});
export type CreateKitchenIncident = z.infer<typeof CreateKitchenIncidentSchema>;

export const KitchenIncidentSchema = z.object({
  id: z.string().uuid(),
  category: KitchenIncidentCategoryEnum,
  note: z.string(),
  authorId: z.string().uuid(),
  authorName: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type KitchenIncident = z.infer<typeof KitchenIncidentSchema>;

// ── Checklist de apertura / cierre ───────────────────────────────────

export const ChecklistTypeEnum = z.enum(['OPEN', 'CLOSE']);
export type ChecklistType = z.infer<typeof ChecklistTypeEnum>;

/** Ítem del checklist (lo administra el dueño/admin). */
export const ChecklistItemSchema = z.object({
  id: z.string().uuid(),
  type: ChecklistTypeEnum,
  label: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const CreateChecklistItemSchema = z.object({
  type: ChecklistTypeEnum,
  label: z.string().min(2).max(200),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateChecklistItem = z.infer<typeof CreateChecklistItemSchema>;

export const UpdateChecklistItemSchema = z.object({
  label: z.string().min(2).max(200).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateChecklistItem = z.infer<typeof UpdateChecklistItemSchema>;

/** Estado del checklist de hoy: ítems + si ya se completó esa rutina hoy. */
export const ChecklistTodaySchema = z.object({
  type: ChecklistTypeEnum,
  items: z.array(ChecklistItemSchema),
  /** Última vez que se completó esta rutina HOY (null si aún no). */
  completedAt: z.string().datetime().nullable(),
  completedById: z.string().uuid().nullable(),
  completedByName: z.string().nullable(),
});
export type ChecklistToday = z.infer<typeof ChecklistTodaySchema>;

export const CompleteChecklistSchema = z.object({
  type: ChecklistTypeEnum,
  /** Ítems marcados como hechos (deben cubrir todos los activos para completar). */
  doneItemIds: z.array(z.string().uuid()).min(1),
});
export type CompleteChecklist = z.infer<typeof CompleteChecklistSchema>;
