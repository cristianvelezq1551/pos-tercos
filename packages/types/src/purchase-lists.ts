import { z } from 'zod';
import { StockableTypeEnum } from './inventory';

// ====================================================================
// LISTA DE FALTANTES (2026-08-26)
// ====================================================================
// Complemento manual de las sugerencias automáticas: quien compra arma un
// documento con varios ítems, decide cuánto pedir de cada uno mirando las
// existencias y el mínimo, y lo imprime —general o partido por proveedor—.
// Queda guardado como historial de qué se pidió y quién lo pidió.
// ====================================================================

export const PurchaseListStatusEnum = z.enum(['DRAFT', 'CLOSED']);
export type PurchaseListStatus = z.infer<typeof PurchaseListStatusEnum>;

export const PURCHASE_LIST_STATUS_LABELS: Record<PurchaseListStatus, string> = {
  DRAFT: 'En preparación',
  CLOSED: 'Cerrada',
};

export const PurchaseListItemSchema = z.object({
  id: z.string().uuid(),
  entityType: StockableTypeEnum,
  ingredientId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  entityName: z.string(),
  /** Cantidad a comprar, en unidad de COMPRA. */
  quantity: z.number().positive(),
  unitPurchase: z.string(),
  /** Unidad del inventario (g, unidad): la de `currentStock` y `thresholdMin`. */
  unitStock: z.string(),
  conversionFactor: z.number().positive(),
  /** Snapshot: el papel tiene que decir lo mismo dentro de un mes. */
  currentStock: z.number(),
  thresholdMin: z.number(),
  estUnitCost: z.number().nullable(),
  estTotal: z.number().nullable(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  note: z.string().nullable(),
});
export type PurchaseListItem = z.infer<typeof PurchaseListItemSchema>;

export const PurchaseListSchema = z.object({
  id: z.string().uuid(),
  status: PurchaseListStatusEnum,
  title: z.string().nullable(),
  notes: z.string().nullable(),
  /** Revisión de la IA: si las cantidades alcanzan o se quedan cortas. */
  aiRationale: z.string().nullable(),
  aiModel: z.string().nullable(),
  aiEvaluatedAt: z.string().datetime().nullable(),
  createdById: z.string().uuid(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  closedByName: z.string().nullable(),
  items: z.array(PurchaseListItemSchema),
  /** Suma de los `estTotal` conocidos. Los ítems sin costo NO suman. */
  estTotal: z.number(),
  /** Cuántos ítems no tienen costo conocido: el total está incompleto. */
  itemsWithoutCost: z.number().int().nonnegative(),
});
export type PurchaseList = z.infer<typeof PurchaseListSchema>;

/** Resumen para el listado del historial (sin traer todos los ítems). */
export const PurchaseListSummarySchema = z.object({
  id: z.string().uuid(),
  status: PurchaseListStatusEnum,
  title: z.string().nullable(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  itemCount: z.number().int().nonnegative(),
  estTotal: z.number(),
  itemsWithoutCost: z.number().int().nonnegative(),
  evaluatedByAi: z.boolean(),
});
export type PurchaseListSummary = z.infer<typeof PurchaseListSummarySchema>;

export const CreatePurchaseListSchema = z.object({
  title: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
  /**
   * true = arranca con TODO lo que está bajo el mínimo, con la cantidad que
   * hace falta para llegar. Es el camino normal: la lista nace llena y quien
   * compra ajusta, en vez de teclear desde cero.
   */
  prefillFromLowStock: z.boolean().optional(),
});
export type CreatePurchaseList = z.infer<typeof CreatePurchaseListSchema>;

export const UpsertPurchaseListItemSchema = z.object({
  entityType: StockableTypeEnum,
  entityId: z.string().uuid(),
  /** En unidad de compra. Si se omite, se usa lo que falta para el mínimo. */
  quantity: z.number().positive().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});
export type UpsertPurchaseListItem = z.infer<typeof UpsertPurchaseListItemSchema>;

export const UpdatePurchaseListItemSchema = z.object({
  quantity: z.number().positive().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});
export type UpdatePurchaseListItem = z.infer<typeof UpdatePurchaseListItemSchema>;

export const UpdatePurchaseListSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type UpdatePurchaseList = z.infer<typeof UpdatePurchaseListSchema>;

/**
 * Un ítem candidato a entrar en la lista: lo que el formulario muestra para
 * elegir. Trae existencias, mínimo y cuánto haría falta, ya calculado.
 */
export const ShortageCandidateSchema = z.object({
  entityType: StockableTypeEnum,
  entityId: z.string().uuid(),
  name: z.string(),
  unitPurchase: z.string(),
  unitStock: z.string(),
  conversionFactor: z.number().positive(),
  currentStock: z.number(),
  thresholdMin: z.number(),
  /** Lo que falta para el mínimo, en unidad de stock. 0 si no falta. */
  deficitStock: z.number(),
  /** Lo que habría que comprar para cubrirlo, en unidad de compra. */
  suggestedQty: z.number().positive(),
  estUnitCost: z.number().nullable(),
  /** true = está por debajo del mínimo ahora mismo. */
  belowMinimum: z.boolean(),
  /** Último proveedor que lo vendió, para prellenar el selector. */
  lastSupplierId: z.string().uuid().nullable(),
  lastSupplierName: z.string().nullable(),
});
export type ShortageCandidate = z.infer<typeof ShortageCandidateSchema>;
