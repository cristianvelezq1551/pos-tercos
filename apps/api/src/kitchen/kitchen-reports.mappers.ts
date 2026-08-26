import type {
  ChecklistDay,
  KitchenActivityDay,
  KitchenActivityUser,
  KitchenProductionRun,
  KitchenWasteEntry,
  StockableType,
} from '@pos-tercos/types';
import { roundCost, roundMoney } from '@pos-tercos/domain';
import { ymdLocal } from '../common/local-dates';

interface NamedRefs {
  ingredient: { name: string; unitRecipe: string } | null;
  product: { name: string; unitStock: string | null } | null;
  subproduct: { name: string; unit: string } | null;
}

export interface ProductionHeaderRow {
  id: string;
  sourceId: string | null;
  subproductId: string | null;
  delta: unknown;
  notes: string | null;
  evidenceKey: string | null;
  userId: string | null;
  createdAt: Date;
  subproduct: { name: string; unit: string } | null;
  user: { fullName: string } | null;
}

export interface ProductionInputRow extends NamedRefs {
  sourceId: string | null;
  entityType: StockableType;
  ingredientId: string | null;
  productId: string | null;
  subproductId: string | null;
  delta: unknown;
}

export interface WasteRow extends NamedRefs {
  id: string;
  entityType: StockableType;
  ingredientId: string | null;
  productId: string | null;
  subproductId: string | null;
  delta: unknown;
  notes: string | null;
  evidenceKey: string | null;
  userId: string | null;
  createdAt: Date;
  user: { fullName: string } | null;
}

function unitOf(row: NamedRefs, type: StockableType): string {
  if (type === 'INGREDIENT') return row.ingredient?.unitRecipe ?? 'unidad';
  if (type === 'PRODUCT') return row.product?.unitStock ?? 'unidad';
  return row.subproduct?.unit ?? 'unidad';
}

function nameOf(row: NamedRefs, type: StockableType): string {
  if (type === 'INGREDIENT') return row.ingredient?.name ?? 'Insumo';
  if (type === 'PRODUCT') return row.product?.name ?? 'Producto';
  return row.subproduct?.name ?? 'Subproducto';
}

function idOf(row: { ingredientId: string | null; productId: string | null; subproductId: string | null }): string {
  return row.ingredientId ?? row.productId ?? row.subproductId ?? '';
}

/** Ruta de la foto, o null. Va por movimiento (una merma no tiene tanda). */
function evidenceUrlOf(movementId: string, evidenceKey: string | null): string | null {
  return evidenceKey ? `/api/inventory/movements/${movementId}/evidence` : null;
}

export function toProductionRun(
  header: ProductionHeaderRow,
  inputs: ProductionInputRow[],
): KitchenProductionRun {
  return {
    runId: header.sourceId ?? header.id,
    subproductId: header.subproductId ?? '',
    subproductName: header.subproduct?.name ?? 'Subproducto',
    quantityProduced: roundCost(Number(header.delta)),
    unit: header.subproduct?.unit ?? 'unidad',
    userId: header.userId,
    userName: header.user?.fullName ?? null,
    notes: header.notes,
    evidenceUrl: evidenceUrlOf(header.id, header.evidenceKey),
    createdAt: header.createdAt.toISOString(),
    inputs: inputs.map((i) => ({
      entityType: i.entityType,
      entityId: idOf(i),
      name: nameOf(i, i.entityType),
      quantity: roundCost(Math.abs(Number(i.delta))),
      unit: unitOf(i, i.entityType),
    })),
  };
}

export function toWasteEntry(
  row: WasteRow,
  reversedDelta: number,
  cost: { cost: number; estimatedCost: number } | null,
): KitchenWasteEntry {
  return {
    movementId: row.id,
    entityType: row.entityType,
    entityId: idOf(row),
    name: nameOf(row, row.entityType),
    quantity: roundCost(Math.abs(Number(row.delta))),
    unit: unitOf(row, row.entityType),
    // El motivo del cocinero se guarda en las notas del movimiento.
    reason: row.notes,
    userId: row.userId,
    userName: row.user?.fullName ?? null,
    evidenceUrl: evidenceUrlOf(row.id, row.evidenceKey),
    reversedQty: roundCost(Math.max(0, reversedDelta)),
    costAmount: cost ? roundMoney(cost.cost) : null,
    // Estimado = el faltante se valoró al último precio conocido, no a una
    // compra real. Se declara para no mostrar una cifra cerrada que no lo es.
    costEstimated: (cost?.estimatedCost ?? 0) > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

interface ActivityInput {
  days: string[];
  productions: { userId: string | null; delta: unknown; createdAt: Date }[];
  wastes: { id: string; userId: string | null; createdAt: Date }[];
  incidents: { authorId: string; createdAt: Date }[];
  marks: { day: string; doneById: string }[];
  checklistDays: ChecklistDay[];
  costs: Map<string, { cost: number; estimatedCost: number }>;
  names: Map<string, string>;
}

interface ActivityCtx {
  byDay: Map<string, KitchenActivityDay>;
  /** día → userId → acumulado de esa persona ese día. */
  usersByDay: Map<string, Map<string, KitchenActivityUser>>;
  names: Map<string, string>;
}

/** Acumulador de una persona en un día; lo crea al vuelo la primera vez. */
function userIn(ctx: ActivityCtx, day: string, userId: string | null): KitchenActivityUser | null {
  const bucket = ctx.usersByDay.get(day);
  if (!bucket || !userId) return null;
  const existing = bucket.get(userId);
  if (existing) return existing;
  const fresh: KitchenActivityUser = {
    userId,
    userName: ctx.names.get(userId) ?? null,
    productionRuns: 0,
    producedUnits: 0,
    wasteEntries: 0,
    wasteCost: 0,
    incidentsLogged: 0,
    checklistMarks: 0,
  };
  bucket.set(userId, fresh);
  return fresh;
}

function applyProductions(ctx: ActivityCtx, rows: ActivityInput['productions']): void {
  for (const p of rows) {
    const day = ctx.byDay.get(ymdLocal(p.createdAt));
    if (!day) continue;
    day.productionRuns++;
    const user = userIn(ctx, day.day, p.userId);
    if (user) {
      user.productionRuns++;
      user.producedUnits = roundCost(user.producedUnits + Number(p.delta));
    }
  }
}

function applyWastes(
  ctx: ActivityCtx,
  rows: ActivityInput['wastes'],
  costs: ActivityInput['costs'],
): void {
  for (const w of rows) {
    const day = ctx.byDay.get(ymdLocal(w.createdAt));
    if (!day) continue;
    const cost = costs.get(w.id);
    day.wasteEntries++;
    day.wasteCost = roundMoney(day.wasteCost + (cost?.cost ?? 0));
    day.wasteCostEstimated = roundMoney(day.wasteCostEstimated + (cost?.estimatedCost ?? 0));
    const user = userIn(ctx, day.day, w.userId);
    if (user) {
      user.wasteEntries++;
      user.wasteCost = roundMoney(user.wasteCost + (cost?.cost ?? 0));
    }
  }
}

function applyIncidents(ctx: ActivityCtx, rows: ActivityInput['incidents']): void {
  for (const i of rows) {
    const day = ctx.byDay.get(ymdLocal(i.createdAt));
    if (!day) continue;
    day.incidentsLogged++;
    const user = userIn(ctx, day.day, i.authorId);
    if (user) user.incidentsLogged++;
  }
}

function applyMarks(ctx: ActivityCtx, rows: ActivityInput['marks']): void {
  for (const m of rows) {
    const user = userIn(ctx, m.day, m.doneById);
    if (user) user.checklistMarks++;
  }
}

export function buildActivityDays(input: ActivityInput): KitchenActivityDay[] {
  const ctx: ActivityCtx = { byDay: new Map(), usersByDay: new Map(), names: input.names };
  for (const day of input.days) {
    ctx.byDay.set(day, emptyDay(day, input.checklistDays));
    ctx.usersByDay.set(day, new Map());
  }

  applyProductions(ctx, input.productions);
  applyWastes(ctx, input.wastes, input.costs);
  applyIncidents(ctx, input.incidents);
  applyMarks(ctx, input.marks);

  return input.days.map((day) => {
    const entry = ctx.byDay.get(day)!;
    entry.users = [...(ctx.usersByDay.get(day)?.values() ?? [])].sort((a, b) =>
      (a.userName ?? '').localeCompare(b.userName ?? ''),
    );
    return entry;
  });
}

function emptyDay(day: string, checklistDays: ChecklistDay[]): KitchenActivityDay {
  const routine = (type: 'OPEN' | 'CLOSE') => {
    const found = checklistDays.find((c) => c.day === day && c.type === type);
    return {
      doneCount: found?.doneCount ?? 0,
      totalCount: found?.totalCount ?? 0,
      completed: found?.completedAt != null,
    };
  };
  return {
    day,
    openRoutine: routine('OPEN'),
    closeRoutine: routine('CLOSE'),
    productionRuns: 0,
    wasteEntries: 0,
    wasteCost: 0,
    wasteCostEstimated: 0,
    incidentsLogged: 0,
    users: [],
  };
}
