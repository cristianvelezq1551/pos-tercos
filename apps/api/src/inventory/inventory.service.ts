import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateInventoryMovement,
  InventoryMovement,
  Stockable,
  StockableType,
} from '@pos-tercos/types';
import type {
  Ingredient as DbIngredient,
  Prisma,
  Product as DbProduct,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DbInventoryMovement = Prisma.InventoryMovementGetPayload<{
  include: {
    ingredient: { select: { name: true } };
    product: { select: { name: true } };
    user: { select: { fullName: true } };
  };
}>;

interface ListMovementsFilter {
  entityType?: StockableType;
  ingredientId?: string;
  productId?: string;
  type?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stock por entidad. Devuelve mapa con clave `${entityType}:${id}`.
   */
  async getCurrentStockMap(): Promise<Map<string, number>> {
    const rows = await this.prisma.inventoryMovement.groupBy({
      by: ['entityType', 'ingredientId', 'productId'],
      _sum: { delta: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const id = r.entityType === 'INGREDIENT' ? r.ingredientId : r.productId;
      if (!id) continue;
      const key = `${r.entityType}:${id}`;
      map.set(key, (map.get(key) ?? 0) + Number(r._sum.delta ?? 0));
    }
    return map;
  }

  async getCurrentStock(entityType: StockableType, id: string): Promise<number> {
    const where: Prisma.InventoryMovementWhereInput =
      entityType === 'INGREDIENT'
        ? { entityType: 'INGREDIENT', ingredientId: id }
        : { entityType: 'PRODUCT', productId: id };
    const result = await this.prisma.inventoryMovement.aggregate({
      where,
      _sum: { delta: true },
    });
    return Number(result._sum.delta ?? 0);
  }

  /**
   * Lista unificada: insumos + productos direct-resale.
   */
  async listStockables(opts: { onlyActive?: boolean; lowStock?: boolean } = {}): Promise<Stockable[]> {
    const ingredientWhere: Prisma.IngredientWhereInput = opts.onlyActive ? { isActive: true } : {};
    const productWhere: Prisma.ProductWhereInput = {
      directResale: true,
      ...(opts.onlyActive ? { isActive: true } : {}),
    };

    const [ingredients, products, stockMap] = await Promise.all([
      this.prisma.ingredient.findMany({ where: ingredientWhere, orderBy: { name: 'asc' } }),
      this.prisma.product.findMany({ where: productWhere, orderBy: { name: 'asc' } }),
      this.getCurrentStockMap(),
    ]);

    const ingrItems: Stockable[] = ingredients.map((i) =>
      ingredientToStockable(i, stockMap.get(`INGREDIENT:${i.id}`) ?? 0),
    );
    const prodItems: Stockable[] = products.map((p) =>
      productToStockable(p, stockMap.get(`PRODUCT:${p.id}`) ?? 0),
    );

    let merged = [...ingrItems, ...prodItems];
    if (opts.lowStock) merged = merged.filter((s) => s.lowStock);
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getStockableById(entityType: StockableType, id: string): Promise<Stockable> {
    if (entityType === 'INGREDIENT') {
      const row = await this.prisma.ingredient.findUnique({ where: { id } });
      if (!row) throw new NotFoundException(`Ingredient ${id} not found`);
      const current = await this.getCurrentStock('INGREDIENT', id);
      return ingredientToStockable(row, current);
    }
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Product ${id} not found`);
    if (!row.directResale) {
      throw new BadRequestException(`Product ${id} is not direct-resale; no own stock.`);
    }
    const current = await this.getCurrentStock('PRODUCT', id);
    return productToStockable(row, current);
  }

  async createMovement(
    input: CreateInventoryMovement,
    userId?: string,
  ): Promise<InventoryMovement> {
    if (input.entityType === 'INGREDIENT') {
      const ing = await this.prisma.ingredient.findUnique({
        where: { id: input.ingredientId! },
        select: { id: true, isActive: true },
      });
      if (!ing) throw new NotFoundException(`Ingredient ${input.ingredientId} not found`);
      if (!ing.isActive) {
        throw new BadRequestException(`Ingredient ${input.ingredientId} is inactive`);
      }
    } else {
      const prod = await this.prisma.product.findUnique({
        where: { id: input.productId! },
        select: { id: true, isActive: true, directResale: true },
      });
      if (!prod) throw new NotFoundException(`Product ${input.productId} not found`);
      if (!prod.isActive) {
        throw new BadRequestException(`Product ${input.productId} is inactive`);
      }
      if (!prod.directResale) {
        throw new BadRequestException(
          `Product ${input.productId} is not direct-resale; cannot track stock`,
        );
      }
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.inventoryMovement.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: includeFull(),
      });
      if (existing) return toMovementDto(existing);
    }

    try {
      const created = await this.prisma.inventoryMovement.create({
        data: {
          entityType: input.entityType,
          ingredientId: input.entityType === 'INGREDIENT' ? input.ingredientId : null,
          productId: input.entityType === 'PRODUCT' ? input.productId : null,
          delta: input.delta,
          type: input.type,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          userId: userId ?? null,
        },
        include: includeFull(),
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
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.ingredientId) where.ingredientId = filter.ingredientId;
    if (filter.productId) where.productId = filter.productId;
    if (filter.type) where.type = filter.type as Prisma.InventoryMovementWhereInput['type'];
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }

    const rows = await this.prisma.inventoryMovement.findMany({
      where,
      include: includeFull(),
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 200,
    });
    return rows.map(toMovementDto);
  }
}

function includeFull() {
  return {
    ingredient: { select: { name: true } },
    product: { select: { name: true } },
    user: { select: { fullName: true } },
  } satisfies Prisma.InventoryMovementInclude;
}

function ingredientToStockable(row: DbIngredient, current: number): Stockable {
  const thresholdMin = Number(row.thresholdMin);
  return {
    type: 'INGREDIENT',
    id: row.id,
    name: row.name,
    unitStock: row.unitRecipe,
    unitPurchase: row.unitPurchase,
    conversionFactor: Number(row.conversionFactor),
    thresholdMin,
    isActive: row.isActive,
    currentStock: current,
    lowStock: row.isActive && current < thresholdMin,
    category: null,
    basePrice: null,
  };
}

function productToStockable(row: DbProduct, current: number): Stockable {
  const thresholdMin = Number(row.thresholdMin);
  return {
    type: 'PRODUCT',
    id: row.id,
    name: row.name,
    unitStock: row.unitStock ?? 'unidad',
    unitPurchase: row.unitPurchase ?? 'unidad',
    conversionFactor: row.conversionFactor !== null ? Number(row.conversionFactor) : 1,
    thresholdMin,
    isActive: row.isActive,
    currentStock: current,
    lowStock: row.isActive && current < thresholdMin,
    category: row.category,
    basePrice: Number(row.basePrice),
  };
}

function toMovementDto(row: DbInventoryMovement): InventoryMovement {
  const itemName =
    row.entityType === 'INGREDIENT' ? row.ingredient?.name : row.product?.name;
  return {
    id: row.id,
    entityType: row.entityType,
    ingredientId: row.ingredientId,
    productId: row.productId,
    itemName: itemName ?? undefined,
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
