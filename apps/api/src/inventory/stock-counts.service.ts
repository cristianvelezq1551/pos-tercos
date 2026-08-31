import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CountTask,
  CreateStockCount,
  StockCount,
  StockableType,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { runWithSerializationRetry } from '../common/tx';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

/** Diferencia mínima (en unidad de stock) que genera ajuste. Por debajo es ruido de báscula. */
const COUNT_EPSILON = 0.0001;

/** Reintentos cuando Postgres aborta la tx Serializable por conflicto (40001). */
const MAX_COUNT_RETRIES = 3;


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
  async register(
    input: CreateStockCount,
    userId: string,
    opts: { autoApprove?: boolean } = {},
  ): Promise<StockCount> {
    const autoApprove = opts.autoApprove ?? true;
    const entityId =
      input.entityType === 'INGREDIENT'
        ? input.ingredientId!
        : input.entityType === 'PRODUCT'
          ? input.productId!
          : input.subproductId!;

    // Valida existencia + activo (lanza NotFound/BadRequest del inventory).
    const stockable = await this.inventory.getStockableById(input.entityType, entityId);

    const created = await this.registerWithRetry(input, entityId, userId, autoApprove);

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
        pendingApproval: !autoApprove,
        adjustmentCreated: autoApprove && Math.abs(Number(created.difference)) > COUNT_EPSILON,
      },
    });

    return this.toDto(created, stockable.name, stockable.unitStock ?? '', null);
  }

  /** Conteos del cocinero pendientes de aprobación (para el admin). */
  async listPending(): Promise<StockCount[]> {
    const rows = await this.prisma.stockCount.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: countIncludes(),
    });
    return rows.map((r) => this.rowToDto(r, null));
  }

  /**
   * El admin APRUEBA un conteo pendiente: aplica la diferencia detectada al
   * momento del conteo (delta = difference(T)) como ajuste. Usar la diferencia
   * guardada —no recalcular contra el ledger actual— preserva las ventas y
   * producciones legítimas ocurridas entre el conteo y la aprobación.
   */
  async approve(id: string, adminId: string, note?: string): Promise<StockCount> {
    const existing = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Conteo no encontrado');
    if (existing.status !== 'PENDING') throw new BadRequestException('El conteo ya fue resuelto.');
    const difference = Number(existing.difference);

    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.stockCount.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', resolvedById: adminId, resolvedAt: new Date(), resolverNote: note ?? null },
      });
      if (claim.count === 0) throw new BadRequestException('El conteo ya fue resuelto.');
      if (Math.abs(difference) > COUNT_EPSILON) {
        await tx.inventoryMovement.create({
          data: {
            entityType: existing.entityType,
            ingredientId: existing.ingredientId,
            productId: existing.productId,
            subproductId: existing.subproductId,
            delta: difference,
            type: 'MANUAL_ADJUSTMENT',
            sourceType: 'stock_count',
            sourceId: id,
            userId: adminId,
            notes: `Conteo aprobado: dif. ${difference}${note ? ` · ${note}` : ''}`.slice(0, 200),
          },
        });
      }
      // Cualquier OTRO conteo pendiente del MISMO stockable quedó obsoleto: su
      // `difference` se calculó contra un ledger que no incluía este ajuste, así
      // que aprobarlo después doble-aplicaría la discrepancia. Se supersede.
      await tx.stockCount.updateMany({
        where: {
          id: { not: id },
          status: 'PENDING',
          entityType: existing.entityType,
          ingredientId: existing.ingredientId,
          productId: existing.productId,
          subproductId: existing.subproductId,
        },
        data: {
          status: 'REJECTED',
          resolvedById: adminId,
          resolvedAt: new Date(),
          resolverNote: 'Reemplazado por un conteo aprobado más reciente del mismo ítem.',
        },
      });
    });

    await this.audit.log({
      userId: adminId,
      action: 'STOCK_COUNT_APPROVED',
      entityType: 'stock_count',
      entityId: id,
      metadata: { difference, adjustmentCreated: Math.abs(difference) > COUNT_EPSILON, note: note ?? null },
    });
    return this.readOne(id);
  }

  /** El admin RECHAZA un conteo pendiente: no ajusta stock. */
  async reject(id: string, adminId: string, note?: string): Promise<StockCount> {
    const existing = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Conteo no encontrado');
    if (existing.status !== 'PENDING') throw new BadRequestException('El conteo ya fue resuelto.');
    await this.prisma.stockCount.update({
      where: { id },
      data: { status: 'REJECTED', resolvedById: adminId, resolvedAt: new Date(), resolverNote: note ?? null },
    });
    await this.audit.log({
      userId: adminId,
      action: 'STOCK_COUNT_REJECTED',
      entityType: 'stock_count',
      entityId: id,
      metadata: { note: note ?? null },
    });
    return this.readOne(id);
  }

  private async readOne(id: string): Promise<StockCount> {
    const row = await this.prisma.stockCount.findUniqueOrThrow({ where: { id }, include: countIncludes() });
    const resolverName = row.resolvedById
      ? (await this.prisma.user.findUnique({ where: { id: row.resolvedById }, select: { fullName: true } }))?.fullName ?? null
      : null;
    return this.rowToDto(row, resolverName);
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
    autoApprove: boolean,
  ): Promise<Prisma.StockCountGetPayload<object>> {
    return runWithSerializationRetry(
      () =>
        this.prisma.$transaction(
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
                // Conteo del cocinero → PENDING (sin ajustar). Conteo del admin →
                // APPROVED e inmediato (aplica el ajuste en esta misma tx).
                status: autoApprove ? 'APPROVED' : 'PENDING',
                resolvedById: autoApprove ? userId : null,
                resolvedAt: autoApprove ? new Date() : null,
                userId,
                notes: input.notes ?? null,
              },
            });

            if (autoApprove && Math.abs(difference) > COUNT_EPSILON) {
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
            if (autoApprove) {
              // Igual que `approve`: los PENDING previos del MISMO stockable se
              // calcularon contra un ledger que no incluye este ajuste —
              // aprobarlos después doble-aplicaría la discrepancia (el conteo
              // del cocinero de la mañana + el del admin de la tarde restaban
              // dos veces). Se supersede acá también.
              await tx.stockCount.updateMany({
                where: {
                  id: { not: count.id },
                  status: 'PENDING',
                  entityType: input.entityType,
                  ingredientId: input.ingredientId ?? null,
                  productId: input.productId ?? null,
                  subproductId: input.subproductId ?? null,
                },
                data: {
                  status: 'REJECTED',
                  resolvedById: userId,
                  resolvedAt: new Date(),
                  resolverNote: 'Reemplazado por un conteo aprobado más reciente del mismo ítem.',
                },
              });
            }
            return count;
          },
          { isolationLevel: 'Serializable', timeout: 10_000 },
        ),
      MAX_COUNT_RETRIES,
    );
  }

  /** Historial de conteos (para la sección inferior de la página). */
  async listRecent(limit = 30): Promise<StockCount[]> {
    const rows = await this.prisma.stockCount.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: countIncludes(),
    });
    const resolverIds = [...new Set(rows.map((r) => r.resolvedById).filter((x): x is string => !!x))];
    const resolvers = resolverIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, fullName: true } })
      : [];
    const resolverName = new Map(resolvers.map((u) => [u.id, u.fullName]));
    return rows.map((r) => this.rowToDto(r, r.resolvedById ? (resolverName.get(r.resolvedById) ?? null) : null));
  }

  private rowToDto(r: CountRow, resolverName: string | null): StockCount {
    return {
      id: r.id,
      entityType: r.entityType,
      entityId: (r.ingredientId ?? r.productId ?? r.subproductId)!,
      name: r.ingredient?.name ?? r.product?.name ?? r.subproduct?.name ?? '(eliminado)',
      unit: r.ingredient?.unitRecipe ?? r.product?.unitStock ?? r.subproduct?.unit ?? '',
      countedQty: Number(r.countedQty),
      ledgerQty: Number(r.ledgerQty),
      difference: Number(r.difference),
      status: r.status,
      userId: r.userId,
      userName: r.user?.fullName ?? null,
      resolvedByName: resolverName,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolverNote: r.resolverNote,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toDto(
    created: Prisma.StockCountGetPayload<object>,
    name: string,
    unit: string,
    resolverName: string | null,
  ): StockCount {
    return {
      id: created.id,
      entityType: created.entityType,
      entityId: (created.ingredientId ?? created.productId ?? created.subproductId)!,
      name,
      unit,
      countedQty: Number(created.countedQty),
      ledgerQty: Number(created.ledgerQty),
      difference: Number(created.difference),
      status: created.status,
      userId: created.userId,
      userName: null,
      resolvedByName: resolverName,
      resolvedAt: created.resolvedAt?.toISOString() ?? null,
      resolverNote: created.resolverNote,
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
    };
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

/** Include estándar para resolver el nombre del stockable y de quien contó. */
function countIncludes() {
  return {
    ingredient: { select: { name: true, unitRecipe: true } },
    product: { select: { name: true, unitStock: true } },
    subproduct: { select: { name: true, unit: true } },
    user: { select: { fullName: true } },
  } satisfies Prisma.StockCountInclude;
}

type CountRow = Prisma.StockCountGetPayload<{ include: ReturnType<typeof countIncludes> }>;
