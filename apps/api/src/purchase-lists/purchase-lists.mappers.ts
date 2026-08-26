import type {
  PurchaseList,
  PurchaseListItem,
  PurchaseListSummary,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { roundMoney } from '@pos-tercos/domain';

export type DbListWithItems = Prisma.PurchaseListGetPayload<{
  include: {
    createdBy: { select: { fullName: true } };
    closedBy: { select: { fullName: true } };
    items: {
      include: {
        ingredient: { select: { name: true } };
        product: { select: { name: true } };
        supplier: { select: { name: true } };
      };
    };
  };
}>;

export function includeFullList() {
  return {
    createdBy: { select: { fullName: true } },
    closedBy: { select: { fullName: true } },
    items: {
      orderBy: { createdAt: 'asc' },
      include: {
        ingredient: { select: { name: true } },
        product: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    },
  } satisfies Prisma.PurchaseListInclude;
}

function toItemDto(row: DbListWithItems['items'][number]): PurchaseListItem {
  return {
    id: row.id,
    entityType: row.entityType,
    ingredientId: row.ingredientId,
    productId: row.productId,
    entityName:
      row.entityType === 'INGREDIENT'
        ? (row.ingredient?.name ?? '(insumo eliminado)')
        : (row.product?.name ?? '(producto eliminado)'),
    quantity: Number(row.quantity),
    unitPurchase: row.unitPurchase,
    unitStock: row.unitStock,
    conversionFactor: Number(row.conversionFactor),
    currentStock: Number(row.currentStock),
    thresholdMin: Number(row.thresholdMin),
    estUnitCost: row.estUnitCost === null ? null : Number(row.estUnitCost),
    estTotal: row.estTotal === null ? null : Number(row.estTotal),
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    note: row.note,
  };
}

/**
 * El total suma SOLO los ítems con costo conocido, y se reporta aparte cuántos
 * quedaron fuera. Rellenar los desconocidos con 0 daría un total que se lee
 * como completo y es menor al que se va a pagar.
 */
export function totalsOf(items: PurchaseListItem[]): {
  estTotal: number;
  itemsWithoutCost: number;
} {
  const conCosto = items.filter((i) => i.estTotal !== null);
  return {
    estTotal: roundMoney(conCosto.reduce((acc, i) => acc + (i.estTotal ?? 0), 0)),
    itemsWithoutCost: items.length - conCosto.length,
  };
}

export function toListDto(row: DbListWithItems): PurchaseList {
  const items = row.items.map(toItemDto);
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    notes: row.notes,
    aiRationale: row.aiRationale,
    aiModel: row.aiModel,
    aiEvaluatedAt: row.aiEvaluatedAt ? row.aiEvaluatedAt.toISOString() : null,
    createdById: row.createdById,
    createdByName: row.createdBy.fullName,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closedByName: row.closedBy?.fullName ?? null,
    items,
    ...totalsOf(items),
  };
}

export function toSummaryDto(row: DbListWithItems): PurchaseListSummary {
  const items = row.items.map(toItemDto);
  const { estTotal, itemsWithoutCost } = totalsOf(items);
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    createdByName: row.createdBy.fullName,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    itemCount: items.length,
    estTotal,
    itemsWithoutCost,
    evaluatedByAi: row.aiEvaluatedAt !== null,
  };
}
