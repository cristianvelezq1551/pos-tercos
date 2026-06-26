import { Injectable } from '@nestjs/common';
import type {
  CountTask,
  CreateStockCount,
  StockCount,
  StockableType,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

/** Diferencia mínima (en unidad de stock) que genera ajuste. Por debajo es ruido de báscula. */
const COUNT_EPSILON = 0.0001;

/** Reintentos cuando Postgres aborta la tx Serializable por conflicto (40001). */
const MAX_COUNT_RETRIES = 3;

/** Postgres SQLSTATE 40001 (serialization_failure) → Prisma lo expone como P2034. */
function isSerializationFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === 'P2034' || /could not serialize|deadlock detected/i.test(err.message);
}

/**
 * Conteo físico ciclado. La idea: contar POCOS ítems por día, rotando, para
 * que todo el inventario pase por un conteo real cada semana. El ledger es
 * perfecto en papel; la realidad (porciones mal servidas, robo, derrames sin
 * declarar) solo aparece contando. Cada conteo:
 *  1. Snapshotea contado vs ledger en `stock_counts` (nunca se edita).
 *  2. Si difiere, crea un MANUAL_ADJUSTMENT compensatorio
 *     (source_type='stock_count') → corrige el ledger Y alimenta el reporte
 *     de uso y mermas (los faltantes aparecen como "$ perdido").
 */
@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sugerencia de qué contar hoy: stockables activos ordenados por "hace
   * cuánto no se cuentan" (nunca contados primero). El llamador muestra los
   * primeros N como la tarea del día.
   */
  async getCountTasks(limit = 5): Promise<CountTask[]> {
    const [stockables, lastCounts] = await Promise.all([
      this.inventory.listStockables({ onlyActive: true }),
      this.prisma.stockCount.groupBy({
        by: ['entityType', 'ingredientId', 'productId', 'subproductId'],
        _max: { createdAt: true },
      }),
    ]);

    const lastByKey = new Map<string, Date>();
    for (const c of lastCounts) {
      const id = c.ingredientId ?? c.productId ?? c.subproductId;
      if (!id || !c._max.createdAt) continue;
      lastByKey.set(`${c.entityType}:${id}`, c._max.createdAt);
    }

    return stockables
      .map((s) => ({
        entityType: s.type,
        entityId: s.id,
        name: s.name,
        unit: s.unitStock ?? '',
        ledgerQty: s.currentStock,
        lastCountedAt: lastByKey.get(`${s.type}:${s.id}`)?.toISOString() ?? null,
      }))
      .sort((a, b) => {
        // Nunca contados primero; después el conteo más viejo.
        if (a.lastCountedAt === null && b.lastCountedAt === null) {
          return a.name.localeCompare(b.name);
        }
        if (a.lastCountedAt === null) return -1;
        if (b.lastCountedAt === null) return 1;
        return a.lastCountedAt.localeCompare(b.lastCountedAt);
      })
      .slice(0, limit);
  }

  /**
   * Registra un conteo. Lee el ledger y crea el ajuste DENTRO de la misma
   * transacción para que la diferencia no quede desfasada por una venta
   * concurrente.
   */
  async register(input: CreateStockCount, userId: string): Promise<StockCount> {
    const entityId =
      input.entityType === 'INGREDIENT'
        ? input.ingredientId!
        : input.entityType === 'PRODUCT'
          ? input.productId!
          : input.subproductId!;

    // Valida existencia + activo (lanza NotFound/BadRequest del inventory).
    const stockable = await this.inventory.getStockableById(input.entityType, entityId);

    const created = await this.registerWithRetry(input, entityId, userId);

    await this.audit.log({
      userId,
      action: 'STOCK_COUNT_REGISTERED',
      entityType: 'stock_count',
      entityId: created.id,
      metadata: {
        stockableType: input.entityType,
        stockableId: entityId,
        name: stockable.name,
        countedQty: input.countedQty,
        ledgerQty: Number(created.ledgerQty),
        difference: Number(created.difference),
        adjustmentCreated: Math.abs(Number(created.difference)) > COUNT_EPSILON,
      },
    });

    return {
      id: created.id,
      entityType: input.entityType,
      entityId,
      name: stockable.name,
      countedQty: Number(created.countedQty),
      ledgerQty: Number(created.ledgerQty),
      difference: Number(created.difference),
      userId,
      userName: null,
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Lee el ledger y crea el ajuste compensatorio bajo isolation SERIALIZABLE,
   * reintentando si Postgres aborta por conflicto. Así una venta/producción
   * concurrente entre la lectura del ledger y la escritura del ajuste no deja
   * el ajuste calculado sobre un stock viejo (corrige el bug del docstring).
   */
  private async registerWithRetry(
    input: CreateStockCount,
    entityId: string,
    userId: string,
  ): Promise<Prisma.StockCountGetPayload<object>> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const ledgerQty = await this.ledgerStock(tx, input.entityType, entityId);
            const difference = input.countedQty - ledgerQty;

            const count = await tx.stockCount.create({
              data: {
                entityType: input.entityType,
                ingredientId: input.ingredientId ?? null,
                productId: input.productId ?? null,
                subproductId: input.subproductId ?? null,
                countedQty: input.countedQty,
                ledgerQty,
                difference,
                userId,
                notes: input.notes ?? null,
              },
            });

            if (Math.abs(difference) > COUNT_EPSILON) {
              await tx.inventoryMovement.create({
                data: {
                  entityType: input.entityType,
                  ingredientId: input.ingredientId ?? null,
                  productId: input.productId ?? null,
                  subproductId: input.subproductId ?? null,
                  delta: difference,
                  type: 'MANUAL_ADJUSTMENT',
                  sourceType: 'stock_count',
                  sourceId: count.id,
                  userId,
                  notes: `Conteo físico: contado ${input.countedQty}, ledger ${ledgerQty}${input.notes ? ` · ${input.notes}` : ''}`,
                },
              });
            }
            return count;
          },
          { isolationLevel: 'Serializable', timeout: 10_000 },
        );
      } catch (err) {
        if (attempt < MAX_COUNT_RETRIES && isSerializationFailure(err)) continue;
        throw err;
      }
    }
  }

  /** Historial de conteos (para la sección inferior de la página). */
  async listRecent(limit = 30): Promise<StockCount[]> {
    const rows = await this.prisma.stockCount.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        ingredient: { select: { name: true } },
        product: { select: { name: true } },
        subproduct: { select: { name: true } },
        user: { select: { fullName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: (r.ingredientId ?? r.productId ?? r.subproductId)!,
      name: r.ingredient?.name ?? r.product?.name ?? r.subproduct?.name ?? '(eliminado)',
      countedQty: Number(r.countedQty),
      ledgerQty: Number(r.ledgerQty),
      difference: Number(r.difference),
      userId: r.userId,
      userName: r.user?.fullName ?? null,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async ledgerStock(
    tx: Prisma.TransactionClient,
    entityType: StockableType,
    id: string,
  ): Promise<number> {
    const where =
      entityType === 'INGREDIENT'
        ? { entityType: 'INGREDIENT' as const, ingredientId: id }
        : entityType === 'PRODUCT'
          ? { entityType: 'PRODUCT' as const, productId: id }
          : { entityType: 'SUBPRODUCT' as const, subproductId: id };
    const agg = await tx.inventoryMovement.aggregate({ where, _sum: { delta: true } });
    return Number(agg._sum.delta ?? 0);
  }
}
