import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type {
  PurchaseSuggestion,
  PurchaseSuggestionStatus,
  ResolveSuggestion,
  ScanResult,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

type DbSuggestionWithRelations = Prisma.PurchaseSuggestionGetPayload<{
  include: {
    ingredient: { select: { name: true } };
    product: { select: { name: true } };
    resolvedBy: { select: { fullName: true } };
  };
}>;

interface ListFilter {
  status?: PurchaseSuggestionStatus | PurchaseSuggestionStatus[];
  limit?: number;
}

@Injectable()
export class PurchaseSuggestionsService {
  private readonly logger = new Logger(PurchaseSuggestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  // ==================================================================
  // SCAN — detección horaria de bajo stock + creación de sugerencias
  // ==================================================================

  /**
   * Cron horario al minuto :15 (escalonado para no chocar con otras crons
   * de inicio de hora). El audit log queda con userId=null porque no hay
   * actor humano: lo dispara el scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runScanScheduled(): Promise<void> {
    try {
      await this.runScan(null);
    } catch (e) {
      // No re-lanzar: el cron no tiene supervisor que reintente.
      this.logger.error(
        `Scan cron failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
    }
  }

  /**
   * Algoritmo:
   *   1. Iterar stockables con thresholdMin > 0.
   *   2. Para cada uno con currentStock < thresholdMin:
   *        - Si NO hay sugerencia PENDING/EVALUATED activa para esa entidad,
   *          crear una nueva. Audit `PURCHASE_SUGGESTION_CREATED`.
   *   3. Para cada sugerencia PENDING/EVALUATED existente cuyo stockable
   *      YA NO está bajo threshold (se repuso por otra vía), marcarla STALE.
   *      Audit `PURCHASE_SUGGESTION_STALE`.
   *
   * Idempotente: re-correr la cron en el mismo minuto no genera duplicados.
   *
   * @param systemUserId ID del user para audit (típicamente el dueño o un
   *   user "system" si existiera). Si null, audit queda con userId=null.
   */
  async runScan(systemUserId: string | null = null): Promise<ScanResult> {
    const scannedAt = new Date();
    const [stockables, ingredientCosts, productCosts] = await Promise.all([
      this.inventory.listStockables({ onlyActive: true }),
      this.prisma.ingredient.findMany({
        where: { isActive: true },
        select: { id: true, lastUnitCost: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true, directResale: true },
        select: { id: true, lastUnitCost: true },
      }),
    ]);

    const costMap = new Map<string, number | null>();
    for (const r of ingredientCosts) {
      costMap.set(
        `INGREDIENT:${r.id}`,
        r.lastUnitCost === null ? null : Number(r.lastUnitCost),
      );
    }
    for (const r of productCosts) {
      costMap.set(
        `PRODUCT:${r.id}`,
        r.lastUnitCost === null ? null : Number(r.lastUnitCost),
      );
    }

    // Pre-cargar sugerencias activas (PENDING o EVALUATED) para dedupe + stale
    const activeSuggestions = await this.prisma.purchaseSuggestion.findMany({
      where: { status: { in: ['PENDING', 'EVALUATED'] } },
      select: {
        id: true,
        entityType: true,
        ingredientId: true,
        productId: true,
      },
    });
    const activeKeySet = new Set(
      activeSuggestions.map((s) =>
        s.entityType === 'INGREDIENT'
          ? `INGREDIENT:${s.ingredientId}`
          : `PRODUCT:${s.productId}`,
      ),
    );

    let createdCount = 0;
    const lowStockKeys = new Set<string>();

    for (const s of stockables) {
      const thresholdMin = s.thresholdMin;
      if (thresholdMin <= 0) continue;
      const currentStock = s.currentStock;
      const key = `${s.type}:${s.id}`;

      if (currentStock >= thresholdMin) continue;
      lowStockKeys.add(key);

      if (activeKeySet.has(key)) continue; // ya hay sugerencia abierta

      const suggestedQty = computeSuggestedQty(
        thresholdMin,
        currentStock,
        s.conversionFactor,
      );
      const estUnitCost = costMap.get(key) ?? null;
      const estTotal =
        estUnitCost === null ? null : roundMoney(suggestedQty * estUnitCost);

      const created = await this.prisma.purchaseSuggestion.create({
        data: {
          entityType: s.type,
          ingredientId: s.type === 'INGREDIENT' ? s.id : null,
          productId: s.type === 'PRODUCT' ? s.id : null,
          currentStock,
          thresholdMin,
          unitPurchase: s.unitPurchase,
          suggestedQty,
          estUnitCost,
          estTotal,
        },
      });
      createdCount++;

      await this.audit.log({
        userId: systemUserId,
        action: 'PURCHASE_SUGGESTION_CREATED',
        entityType: 'purchase_suggestion',
        entityId: created.id,
        metadata: {
          stockableType: s.type,
          stockableId: s.id,
          stockableName: s.name,
          currentStock,
          thresholdMin,
          suggestedQty,
          estTotal,
        },
      });
    }

    // Stale: sugerencias activas cuya entidad ya no está bajo threshold
    let staledCount = 0;
    for (const sugg of activeSuggestions) {
      const key =
        sugg.entityType === 'INGREDIENT'
          ? `INGREDIENT:${sugg.ingredientId}`
          : `PRODUCT:${sugg.productId}`;
      if (lowStockKeys.has(key)) continue;

      await this.prisma.purchaseSuggestion.update({
        where: { id: sugg.id },
        data: {
          status: 'STALE',
          resolvedAt: scannedAt,
          resolutionNote: 'Stock se repuso (auto-stale)',
        },
      });
      staledCount++;

      await this.audit.log({
        userId: systemUserId,
        action: 'PURCHASE_SUGGESTION_STALE',
        entityType: 'purchase_suggestion',
        entityId: sugg.id,
      });
    }

    this.logger.log(
      `Scan ${scannedAt.toISOString()}: ${stockables.length} stockables ` +
        `→ ${createdCount} suggestions created, ${staledCount} staled`,
    );

    return {
      scannedAt: scannedAt.toISOString(),
      scannedCount: stockables.length,
      createdCount,
      staledCount,
    };
  }

  // ==================================================================
  // QUERY
  // ==================================================================

  async list(filter: ListFilter = {}): Promise<PurchaseSuggestion[]> {
    const where: Prisma.PurchaseSuggestionWhereInput = {};
    if (filter.status) {
      where.status = Array.isArray(filter.status)
        ? { in: filter.status }
        : filter.status;
    }
    const rows = await this.prisma.purchaseSuggestion.findMany({
      where,
      include: includeFull(),
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 200,
    });
    return rows.map(toDto);
  }

  async getById(id: string): Promise<PurchaseSuggestion> {
    const row = await this.prisma.purchaseSuggestion.findUnique({
      where: { id },
      include: includeFull(),
    });
    if (!row) throw new NotFoundException(`Suggestion ${id} not found`);
    return toDto(row);
  }

  // ==================================================================
  // RESOLUTIONS
  // ==================================================================

  async accept(
    id: string,
    userId: string,
    input: ResolveSuggestion = {},
  ): Promise<PurchaseSuggestion> {
    return this.resolve(id, userId, 'ACCEPTED', input.note);
  }

  async reject(
    id: string,
    userId: string,
    input: ResolveSuggestion = {},
  ): Promise<PurchaseSuggestion> {
    return this.resolve(id, userId, 'REJECTED', input.note);
  }

  private async resolve(
    id: string,
    userId: string,
    status: 'ACCEPTED' | 'REJECTED',
    note: string | undefined,
  ): Promise<PurchaseSuggestion> {
    const existing = await this.prisma.purchaseSuggestion.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Suggestion ${id} not found`);
    if (existing.status !== 'PENDING' && existing.status !== 'EVALUATED') {
      throw new BadRequestException(
        `Suggestion already resolved (status=${existing.status})`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.purchaseSuggestion.update({
      where: { id },
      data: {
        status,
        resolvedById: userId,
        resolvedAt: now,
        resolutionNote: note ?? null,
      },
      include: includeFull(),
    });

    await this.audit.log({
      userId,
      action:
        status === 'ACCEPTED'
          ? 'PURCHASE_SUGGESTION_ACCEPTED'
          : 'PURCHASE_SUGGESTION_REJECTED',
      entityType: 'purchase_suggestion',
      entityId: id,
      metadata: note ? { note } : undefined,
    });

    return toDto(updated);
  }
}

// ====================================================================
// HELPERS
// ====================================================================

function computeSuggestedQty(
  thresholdMin: number,
  currentStock: number,
  conversionFactor: number | null,
): number {
  // Refill target: 2× threshold (queda con 1 threshold de buffer post-compra).
  const targetStockUnits = thresholdMin * 2;
  const deficitStockUnits = Math.max(targetStockUnits - currentStock, 0);
  const factor = conversionFactor && conversionFactor > 0 ? conversionFactor : 1;
  const purchaseQty = deficitStockUnits / factor;
  // Redondear al entero superior — no se compran fracciones de caja/bolsa.
  // Mínimo 1 (la sugerencia tiene sentido si hay déficit).
  return Math.max(Math.ceil(purchaseQty), 1);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function includeFull() {
  return {
    ingredient: { select: { name: true } },
    product: { select: { name: true } },
    resolvedBy: { select: { fullName: true } },
  } satisfies Prisma.PurchaseSuggestionInclude;
}

function toDto(row: DbSuggestionWithRelations): PurchaseSuggestion {
  const entityName =
    row.entityType === 'INGREDIENT'
      ? (row.ingredient?.name ?? '(insumo eliminado)')
      : (row.product?.name ?? '(producto eliminado)');
  return {
    id: row.id,
    entityType: row.entityType,
    ingredientId: row.ingredientId,
    productId: row.productId,
    entityName,
    unitPurchase: row.unitPurchase,
    currentStock: Number(row.currentStock),
    thresholdMin: Number(row.thresholdMin),
    suggestedQty: Number(row.suggestedQty),
    estUnitCost: row.estUnitCost === null ? null : Number(row.estUnitCost),
    estTotal: row.estTotal === null ? null : Number(row.estTotal),
    llmRationale: row.llmRationale,
    llmModel: row.llmModel,
    llmEvaluatedAt: row.llmEvaluatedAt
      ? row.llmEvaluatedAt.toISOString()
      : null,
    status: row.status,
    resolvedById: row.resolvedById,
    resolvedByName: row.resolvedBy?.fullName ?? null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt.toISOString(),
  };
}
