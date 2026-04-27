import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateInventoryMovement,
  IngredientWithStock,
  InventoryMovement,
} from '@pos-tercos/types';
import type { Ingredient as DbIngredient, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DbInventoryMovement = Prisma.InventoryMovementGetPayload<{
  include: {
    ingredient: { select: { name: true } };
    user: { select: { fullName: true } };
  };
}>;

interface ListMovementsFilter {
  ingredientId?: string;
  type?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStockMap(): Promise<Map<string, number>> {
    const rows = await this.prisma.inventoryMovement.groupBy({
      by: ['ingredientId'],
      _sum: { delta: true },
    });
    return new Map(rows.map((r) => [r.ingredientId, Number(r._sum.delta ?? 0)]));
  }

  async getCurrentStock(ingredientId: string): Promise<number> {
    const result = await this.prisma.inventoryMovement.aggregate({
      where: { ingredientId },
      _sum: { delta: true },
    });
    return Number(result._sum.delta ?? 0);
  }

  async listIngredientsWithStock(opts: { onlyActive?: boolean; lowStock?: boolean } = {}): Promise<IngredientWithStock[]> {
    const where: Prisma.IngredientWhereInput = {};
    if (opts.onlyActive) where.isActive = true;

    const rows = await this.prisma.ingredient.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    const stockMap = await this.getCurrentStockMap();

    const merged = rows.map((row) => buildIngredientWithStock(row, stockMap.get(row.id) ?? 0));

    if (opts.lowStock) {
      return merged.filter((m) => m.lowStock);
    }
    return merged;
  }

  async getIngredientWithStock(id: string): Promise<IngredientWithStock> {
    const row = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Ingredient ${id} not found`);
    }
    const current = await this.getCurrentStock(id);
    return buildIngredientWithStock(row, current);
  }

  async createMovement(
    input: CreateInventoryMovement,
    userId?: string,
  ): Promise<InventoryMovement> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
      select: { id: true, isActive: true },
    });
    if (!ingredient) {
      throw new NotFoundException(`Ingredient ${input.ingredientId} not found`);
    }
    if (!ingredient.isActive) {
      throw new BadRequestException(`Ingredient ${input.ingredientId} is inactive`);
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.inventoryMovement.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: {
          ingredient: { select: { name: true } },
          user: { select: { fullName: true } },
        },
      });
      if (existing) {
        return toMovementDto(existing);
      }
    }

    try {
      const created = await this.prisma.inventoryMovement.create({
        data: {
          ingredientId: input.ingredientId,
          delta: input.delta,
          type: input.type,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          userId: userId ?? null,
        },
        include: {
          ingredient: { select: { name: true } },
          user: { select: { fullName: true } },
        },
      });
      return toMovementDto(created);
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Idempotency key conflict');
      }
      throw err;
    }
  }

  async listMovements(filter: ListMovementsFilter = {}): Promise<InventoryMovement[]> {
    const where: Prisma.InventoryMovementWhereInput = {};
    if (filter.ingredientId) where.ingredientId = filter.ingredientId;
    if (filter.type) where.type = filter.type as Prisma.InventoryMovementWhereInput['type'];
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }

    const rows = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        ingredient: { select: { name: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 200,
    });
    return rows.map(toMovementDto);
  }
}

function buildIngredientWithStock(row: DbIngredient, current: number): IngredientWithStock {
  const thresholdMin = Number(row.thresholdMin);
  return {
    id: row.id,
    name: row.name,
    unitPurchase: row.unitPurchase,
    unitRecipe: row.unitRecipe,
    conversionFactor: Number(row.conversionFactor),
    thresholdMin,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    currentStock: current,
    lowStock: row.isActive && current < thresholdMin,
  };
}

function toMovementDto(row: DbInventoryMovement): InventoryMovement {
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    ingredientName: row.ingredient?.name,
    delta: Number(row.delta),
    type: row.type as InventoryMovement['type'],
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    userId: row.userId,
    userFullName: row.user?.fullName ?? null,
    notes: row.notes,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}
