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
    /** Storage key de la foto, OBLIGATORIA (la devuelve POST /kitchen/evidence).
     *  Decisión del dueño: en una merma siempre hay algo físico que fotografiar,
     *  y sin evidencia la pérdida es la palabra de una persona. */
    evidenceKey: z.string().min(1).max(300),
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

// ── Evidencia fotográfica ────────────────────────────────────────────

/** Respuesta de POST /kitchen/evidence: la key que se pasa luego al registro.
 *  Subir la foto y registrar el hecho son dos pasos a propósito — así una foto
 *  pesada no se reintenta junto con la escritura. */
export const EvidenceUploadSchema = z.object({ key: z.string() });
export type EvidenceUpload = z.infer<typeof EvidenceUploadSchema>;

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
  /** Foto de evidencia. Opcional A PROPÓSITO (decisión del dueño): una
   *  incidencia puede ser "se fue la luz" y exigir foto haría que no se
   *  reporte. En merma sí es obligatoria. */
  evidenceKey: z.string().min(1).max(300).optional(),
});
export type CreateKitchenIncident = z.infer<typeof CreateKitchenIncidentSchema>;

export const KitchenIncidentSchema = z.object({
  id: z.string().uuid(),
  category: KitchenIncidentCategoryEnum,
  note: z.string(),
  authorId: z.string().uuid(),
  authorName: z.string().nullable(),
  /** Ruta de la foto, o null si se reportó sin ella (es opcional acá). */
  evidenceUrl: z.string().nullable(),
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

/** Una tarea dentro de la rutina de un día: si se marcó, quién y cuándo. */
export const ChecklistDayItemSchema = z.object({
  itemId: z.string().uuid(),
  label: z.string(),
  done: z.boolean(),
  doneById: z.string().uuid().nullable(),
  doneByName: z.string().nullable(),
  doneAt: z.string().datetime().nullable(),
});
export type ChecklistDayItem = z.infer<typeof ChecklistDayItemSchema>;

/**
 * Una rutina (apertura o cierre) de UN día, con lo que se hizo y lo que faltó.
 *
 * Es el mismo shape para la cocina (el día de hoy) y para el histórico del
 * dueño: dos tipos para la misma cosa se desincronizan siempre — ya pasó con
 * `ShiftZReport` (§7.v31) y con `CortesiasPanel` (§7.v32).
 */
export const ChecklistDaySchema = z.object({
  /** Día local YYYY-MM-DD. */
  day: z.string(),
  type: ChecklistTypeEnum,
  items: z.array(ChecklistDayItemSchema),
  doneCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  /** Cerrada por el cocinero (exige todas las tareas marcadas). */
  completedAt: z.string().datetime().nullable(),
  completedById: z.string().uuid().nullable(),
  completedByName: z.string().nullable(),
  /** Día anterior a las marcas por tarea: se leyó desde `done_item_ids` y NO
   *  hay autor por tarea. La UI lo dice en vez de inventar un nombre. */
  legacy: z.boolean(),
});
export type ChecklistDay = z.infer<typeof ChecklistDaySchema>;

/** Marcar/desmarcar UNA tarea. Se guarda al toque: si al cocinero lo
 *  interrumpen, el avance del día no se pierde. */
export const MarkChecklistItemSchema = z.object({
  type: ChecklistTypeEnum,
  itemId: z.string().uuid(),
  done: z.boolean(),
});
export type MarkChecklistItem = z.infer<typeof MarkChecklistItemSchema>;

/** Cerrar la rutina del día. No lleva la lista de tareas: el server ya tiene
 *  las marcas, y mandarlas de nuevo solo abre la puerta a que no coincidan. */
export const CompleteChecklistSchema = z.object({
  type: ChecklistTypeEnum,
});
export type CompleteChecklist = z.infer<typeof CompleteChecklistSchema>;

// ====================================================================
// VISTAS DEL DUEÑO — lo que hizo la cocina, por día y por persona
// Contratos de lectura para el hub /cocina del admin. El resumen agregado
// (`activity`) se define junto con su consulta, cuando exista el service.
// ====================================================================

// ── Producción, agrupada por TANDA (no por movimiento) ───────────────

/** Un insumo/subproducto consumido por una tanda. */
export const KitchenProductionInputSchema = z.object({
  entityType: StockableTypeEnum,
  entityId: z.string().uuid(),
  name: z.string(),
  /** Cantidad consumida, positiva. */
  quantity: z.number().nonnegative(),
  unit: z.string(),
});
export type KitchenProductionInput = z.infer<typeof KitchenProductionInputSchema>;

/**
 * Una tanda de producción. Una tanda escribe 1 movimiento de entrada + N de
 * consumo encadenados por `source_id`; acá vuelven agrupados, que es como el
 * dueño la piensa ("Fulano produjo 20 porciones de pollo").
 */
export const KitchenProductionRunSchema = z.object({
  runId: z.string().uuid(),
  subproductId: z.string().uuid(),
  subproductName: z.string(),
  quantityProduced: z.number(),
  unit: z.string(),
  userId: z.string().uuid().nullable(),
  userName: z.string().nullable(),
  notes: z.string().nullable(),
  /** Ruta de la foto de evidencia, o null si la tanda se registró sin foto. */
  evidenceUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  inputs: z.array(KitchenProductionInputSchema),
});
export type KitchenProductionRun = z.infer<typeof KitchenProductionRunSchema>;

// ── Merma ────────────────────────────────────────────────────────────

export const KitchenWasteEntrySchema = z.object({
  movementId: z.string().uuid(),
  entityType: StockableTypeEnum,
  entityId: z.string().uuid(),
  name: z.string(),
  /** Cantidad descartada, positiva (el movimiento es negativo). */
  quantity: z.number().nonnegative(),
  unit: z.string(),
  /** Motivo que escribió el cocinero (va en las notas del movimiento). */
  reason: z.string().nullable(),
  userId: z.string().uuid().nullable(),
  userName: z.string().nullable(),
  evidenceUrl: z.string().nullable(),
  /** Cuánto se devolvió al anular la merma (§7.v18). 0 si sigue vigente. */
  reversedQty: z.number().nonnegative(),
  /** Costo de lo perdido según el ledger FIFO. Null si no se pudo valorizar. */
  costAmount: z.number().nullable(),
  /** El costo salió de una estimación, no de una compra real (§7.v32). */
  costEstimated: z.boolean(),
  createdAt: z.string().datetime(),
});
export type KitchenWasteEntry = z.infer<typeof KitchenWasteEntrySchema>;

// ── Resumen por día y por persona ────────────────────────────────────

/** Estado de una rutina dentro del resumen (sin el detalle de tareas). */
export const KitchenRoutineStatusSchema = z.object({
  doneCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  completed: z.boolean(),
});
export type KitchenRoutineStatus = z.infer<typeof KitchenRoutineStatusSchema>;

/** Lo que hizo UNA persona ese día. */
export const KitchenActivityUserSchema = z.object({
  userId: z.string().uuid(),
  userName: z.string().nullable(),
  productionRuns: z.number().int().nonnegative(),
  producedUnits: z.number().nonnegative(),
  wasteEntries: z.number().int().nonnegative(),
  wasteCost: z.number(),
  incidentsLogged: z.number().int().nonnegative(),
  checklistMarks: z.number().int().nonnegative(),
});
export type KitchenActivityUser = z.infer<typeof KitchenActivityUserSchema>;

/**
 * Un día de cocina de un vistazo: rutinas, producción, merma e incidencias,
 * más el desglose por persona. Es la respuesta a "¿qué se hizo ayer?".
 */
export const KitchenActivityDaySchema = z.object({
  day: z.string(),
  openRoutine: KitchenRoutineStatusSchema,
  closeRoutine: KitchenRoutineStatusSchema,
  productionRuns: z.number().int().nonnegative(),
  wasteEntries: z.number().int().nonnegative(),
  /** Costo FIFO de lo mermado ese día, ya neteado por anulaciones. */
  wasteCost: z.number(),
  /** Parte de `wasteCost` que es estimada, no una compra real (§7.v32). */
  wasteCostEstimated: z.number(),
  incidentsLogged: z.number().int().nonnegative(),
  users: z.array(KitchenActivityUserSchema),
});
export type KitchenActivityDay = z.infer<typeof KitchenActivityDaySchema>;
