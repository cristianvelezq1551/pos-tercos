import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { expandRecipeOneLevel } from '@pos-tercos/domain';
import type { ProductionRun, RecordProduction } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';

/**
 * Registra tandas de producción de subproductos: +N al stock del subproducto
 * y consume los insumos según receta.
 *
 * **Garantías de consistencia (importantes para prod):**
 *   1. La validación de stock disponible se hace DENTRO de la transacción
 *      (no antes), bajo isolation level SERIALIZABLE → Postgres aborta
 *      con error 40001 si otra producción tocó los mismos insumos entre
 *      la lectura y la escritura. Reintentamos hasta 3 veces.
 *   2. Todos los movements de la tanda se insertan en un único `createMany`
 *      atómico, encadenados por `source_id=runId` para auditoría.
 *   3. La idempotency-key cae en el movement +N del subproducto. Reintentos
 *      del cliente con la misma key devuelven la tanda previa (no duplica).
 *
 * Sólo Cocinero/Admin/Dueño (gate en controller).
 *
 * Nota FIFO: la columna `unit_cost` del movement +N queda en NULL en esta
 * sesión. El costeo real de subproductos (lot por producción) entra en
 * sesión próxima — hasta entonces, el COGS de productos que usan
 * subproductos queda aproximado (ignora la producción).
 */
@Injectable()
export class ProductionService {
  private static readonly MAX_RETRIES = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
    // Mantenida en el constructor por consistencia con otros services y
    // porque otros métodos futuros pueden necesitarla.
    private readonly _inventory: InventoryService,
    private readonly audit: AuditService,
  ) {
    void this._inventory;
  }

  async produce(
    subproductId: string,
    input: RecordProduction,
    actorId: string,
  ): Promise<ProductionRun> {
    // Pre-validaciones que NO dependen de stock (no compiten entre productions).
    const sub = await this.prisma.subproduct.findUnique({
      where: { id: subproductId },
      select: { id: true, name: true, yield: true, unit: true, isActive: true },
    });
    if (!sub) throw new NotFoundException(`Subproduct ${subproductId} not found`);
    if (!sub.isActive) {
      throw new BadRequestException(`Subproduct ${subproductId} está inactivo.`);
    }
    const yieldNum = Number(sub.yield);
    if (yieldNum <= 0) {
      throw new BadRequestException(
        `Subproducto "${sub.name}" tiene yield inválido (${yieldNum}). Configurálo antes de producir.`,
      );
    }

    // Idempotencia anticipada: si ya se procesó esta key, devolver el run previo.
    if (input.idempotencyKey) {
      const prev = await this.prisma.inventoryMovement.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { sourceId: true },
      });
      if (prev?.sourceId) return this.assembleRunResponse(prev.sourceId);
    }

    // Expandir receta del subproducto (one-level). N unidades del subproducto
    // requieren N/yield ejecuciones de la receta.
    const graph = await this.recipes.loadFullGraph();
    const multiplier = input.quantityProduced / yieldNum;
    const expansion = expandRecipeOneLevel(
      graph,
      { kind: 'subproduct', id: subproductId },
      multiplier,
    );

    if (expansion.ingredients.size === 0 && expansion.subproducts.size === 0) {
      throw new BadRequestException(
        `El subproducto "${sub.name}" no tiene receta configurada. Definila antes de producir.`,
      );
    }

    const runId = randomUUID();
    const notes = input.notes?.trim() || null;
    const consumeNote = `Producción ${sub.name} × ${input.quantityProduced}`;
    const ingredientIds = [...expansion.ingredients.keys()];
    const subproductIds = [...expansion.subproducts.keys()];

    // Datos para los movements: pre-armados, se insertan en una sola tx.
    const movementsData: Prisma.InventoryMovementCreateManyInput[] = [
      {
        entityType: 'SUBPRODUCT',
        subproductId,
        delta: input.quantityProduced,
        unitCost: null,
        type: 'PRODUCTION',
        sourceType: 'production',
        sourceId: runId,
        userId: actorId,
        idempotencyKey: input.idempotencyKey ?? null,
        notes,
      },
      ...[...expansion.ingredients].map(([ingId, item]) => ({
        entityType: 'INGREDIENT' as const,
        ingredientId: ingId,
        delta: -item.totalQuantity,
        unitCost: null,
        type: 'PRODUCTION' as const,
        sourceType: 'production',
        sourceId: runId,
        userId: actorId,
        notes: consumeNote,
      })),
      ...[...expansion.subproducts].map(([childSubId, item]) => ({
        entityType: 'SUBPRODUCT' as const,
        subproductId: childSubId,
        delta: -item.totalQuantity,
        unitCost: null,
        type: 'PRODUCTION' as const,
        sourceType: 'production',
        sourceId: runId,
        userId: actorId,
        notes: consumeNote,
      })),
    ];

    // Transacción SERIALIZABLE con reintentos: la validación de stock va DENTRO
    // de la tx para que ningún otro produce/sale pueda colarse entre el check
    // y la escritura. Si Postgres detecta conflicto (40001) reintentamos.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= ProductionService.MAX_RETRIES; attempt++) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            // Validar stock (atómico: groupBy single query).
            const shortages = await this.checkShortagesInTx(
              tx,
              ingredientIds,
              subproductIds,
              expansion,
            );
            if (shortages.length > 0) {
              throw new ConflictException(
                `Stock insuficiente para producir ${input.quantityProduced} de "${sub.name}":\n· ${shortages.join('\n· ')}`,
              );
            }
            await tx.inventoryMovement.createMany({ data: movementsData });
          },
          { isolationLevel: 'Serializable', timeout: 10_000 },
        );
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (isSerializationFailure(err) && attempt < ProductionService.MAX_RETRIES) {
          continue; // reintenta
        }
        // Idempotency-key colisión (P2002): otra request con la misma key
        // ya creó la tanda — devolver la previa.
        if (isUniqueViolation(err) && input.idempotencyKey) {
          const prev = await this.prisma.inventoryMovement.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            select: { sourceId: true },
          });
          if (prev?.sourceId) return this.assembleRunResponse(prev.sourceId);
          throw new ConflictException('Idempotency key conflict');
        }
        throw err;
      }
    }
    if (lastErr !== null) throw lastErr;

    await this.audit.log({
      userId: actorId,
      action: 'SUBPRODUCT_PRODUCED',
      entityType: 'subproduct',
      entityId: subproductId,
      metadata: {
        runId,
        subproductName: sub.name,
        quantityProduced: input.quantityProduced,
        unit: sub.unit,
        ingredientsConsumed: expansion.ingredients.size,
        subproductsConsumed: expansion.subproducts.size,
      },
    });

    return this.assembleRunResponse(runId);
  }

  /** Lee el stock de todos los insumos+sub-subproductos en una sola groupBy
   *  dentro de la tx y devuelve la lista de faltantes (texto humano). */
  private async checkShortagesInTx(
    tx: Prisma.TransactionClient,
    ingredientIds: string[],
    subproductIds: string[],
    expansion: ReturnType<typeof expandRecipeOneLevel>,
  ): Promise<string[]> {
    const where: Prisma.InventoryMovementWhereInput[] = [];
    if (ingredientIds.length > 0) {
      where.push({ entityType: 'INGREDIENT', ingredientId: { in: ingredientIds } });
    }
    if (subproductIds.length > 0) {
      where.push({ entityType: 'SUBPRODUCT', subproductId: { in: subproductIds } });
    }
    const rows = where.length > 0
      ? await tx.inventoryMovement.groupBy({
          by: ['entityType', 'ingredientId', 'subproductId'],
          where: { OR: where },
          _sum: { delta: true },
        })
      : [];

    const ingStock = new Map<string, number>();
    const subStock = new Map<string, number>();
    for (const r of rows) {
      const sum = Number(r._sum.delta ?? 0);
      if (r.entityType === 'INGREDIENT' && r.ingredientId) {
        ingStock.set(r.ingredientId, (ingStock.get(r.ingredientId) ?? 0) + sum);
      } else if (r.entityType === 'SUBPRODUCT' && r.subproductId) {
        subStock.set(r.subproductId, (subStock.get(r.subproductId) ?? 0) + sum);
      }
    }

    const shortages: string[] = [];
    for (const [ingId, item] of expansion.ingredients) {
      const stock = ingStock.get(ingId) ?? 0;
      if (stock < item.totalQuantity) {
        shortages.push(
          `${item.name} (necesita ${round4(item.totalQuantity)} ${item.unitRecipe}, hay ${round4(stock)})`,
        );
      }
    }
    for (const [subId, item] of expansion.subproducts) {
      const stock = subStock.get(subId) ?? 0;
      if (stock < item.totalQuantity) {
        shortages.push(
          `${item.name} (necesita ${round4(item.totalQuantity)}, hay ${round4(stock)})`,
        );
      }
    }
    return shortages;
  }

  /** Reconstruye la respuesta a partir de los movements de un runId. */
  private async assembleRunResponse(runId: string): Promise<ProductionRun> {
    const rows = await this.prisma.inventoryMovement.findMany({
      where: { sourceId: runId, sourceType: 'production' },
      include: {
        ingredient: { select: { name: true, unitRecipe: true } },
        subproduct: { select: { name: true, unit: true } },
      },
    });
    const positive = rows.find((r) => Number(r.delta) > 0 && r.entityType === 'SUBPRODUCT');
    if (!positive || !positive.subproductId) {
      throw new NotFoundException(`Production run ${runId} not found`);
    }
    const consumed: ProductionRun['consumed'] = rows
      .filter((r) => Number(r.delta) < 0)
      .map((r) => {
        if (r.entityType === 'INGREDIENT' && r.ingredientId) {
          return {
            entityType: 'INGREDIENT',
            entityId: r.ingredientId,
            name: r.ingredient?.name ?? '(insumo)',
            quantityConsumed: Math.abs(Number(r.delta)),
            unit: r.ingredient?.unitRecipe ?? '',
          };
        }
        // SUBPRODUCT (sub-subproducto consumido del stock de otro subproducto).
        return {
          entityType: 'SUBPRODUCT',
          entityId: r.subproductId ?? '',
          name: r.subproduct?.name ?? '(subproducto)',
          quantityConsumed: Math.abs(Number(r.delta)),
          unit: r.subproduct?.unit ?? '',
        };
      });
    return {
      runId,
      subproductId: positive.subproductId,
      subproductName: positive.subproduct?.name ?? '',
      quantityProduced: Number(positive.delta),
      unit: positive.subproduct?.unit ?? '',
      consumed,
      createdAt: positive.createdAt.toISOString(),
    };
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Postgres SQLSTATE 40001 (serialization_failure) lo expone Prisma con `code='P2034'`. */
function isSerializationFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === 'P2034' || /could not serialize/i.test(err.message);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && (err as { code?: string }).code === 'P2002';
}
