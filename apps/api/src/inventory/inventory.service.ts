import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { roundCost, roundsToZeroAt4 } from '@pos-tercos/domain';
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
  Subproduct as DbSubproduct,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DbInventoryMovement = Prisma.InventoryMovementGetPayload<{
  include: {
    ingredient: { select: { name: true } };
    product: { select: { name: true } };
    subproduct: { select: { name: true } };
    user: { select: { fullName: true } };
  };
}>;

interface ListMovementsFilter {
  entityType?: StockableType;
  ingredientId?: string;
  productId?: string;
  subproductId?: string;
  type?: string;
  /** FASE 4 ajustes 2.6: filtra por origen (ej. invoice). */
  sourceType?: string;
  sourceId?: string;
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
      by: ['entityType', 'ingredientId', 'productId', 'subproductId'],
      _sum: { delta: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const id =
        r.entityType === 'INGREDIENT' ? r.ingredientId
        : r.entityType === 'PRODUCT' ? r.productId
        : r.subproductId;
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
        : entityType === 'PRODUCT'
          ? { entityType: 'PRODUCT', productId: id }
          : { entityType: 'SUBPRODUCT', subproductId: id };
    const result = await this.prisma.inventoryMovement.aggregate({
      where,
      _sum: { delta: true },
    });
    return Number(result._sum.delta ?? 0);
  }

  /**
   * Lista unificada: insumos + productos direct-resale + subproductos.
   * Los 3 son stockables de primera clase con su propio inventario.
   */
  /**
   * `negative` = stock por DEBAJO de cero: se vendió/consumió más de lo
   * registrado (venta forzada, offline o cortesía). Es una DEUDA de inventario
   * y casi siempre significa que falta subir una factura o registrar una
   * producción. Independiente de `lowStock` (que compara contra el umbral).
   */
  async listStockables(
    opts: { onlyActive?: boolean; lowStock?: boolean; negative?: boolean } = {},
  ): Promise<Stockable[]> {
    const ingredientWhere: Prisma.IngredientWhereInput = opts.onlyActive ? { isActive: true } : {};
    const productWhere: Prisma.ProductWhereInput = {
      directResale: true,
      ...(opts.onlyActive ? { isActive: true } : {}),
    };
    const subproductWhere: Prisma.SubproductWhereInput = opts.onlyActive ? { isActive: true } : {};

    const [ingredients, products, subproducts, stockMap] = await Promise.all([
      this.prisma.ingredient.findMany({ where: ingredientWhere, orderBy: { name: 'asc' } }),
      this.prisma.product.findMany({ where: productWhere, orderBy: { name: 'asc' } }),
      this.prisma.subproduct.findMany({ where: subproductWhere, orderBy: { name: 'asc' } }),
      this.getCurrentStockMap(),
    ]);

    const ingrItems: Stockable[] = ingredients.map((i) =>
      ingredientToStockable(i, stockMap.get(`INGREDIENT:${i.id}`) ?? 0),
    );
    const prodItems: Stockable[] = products.map((p) =>
      productToStockable(p, stockMap.get(`PRODUCT:${p.id}`) ?? 0),
    );
    const subItems: Stockable[] = subproducts.map((s) =>
      subproductToStockable(s, stockMap.get(`SUBPRODUCT:${s.id}`) ?? 0),
    );

    let merged = [...ingrItems, ...prodItems, ...subItems];
    if (opts.lowStock) merged = merged.filter((s) => s.lowStock);
    // Los negativos se ordenan por el faltante MÁS grande primero (la deuda
    // más urgente arriba), no alfabéticamente.
    if (opts.negative) {
      return merged
        .filter((s) => s.currentStock < 0)
        .sort((a, b) => a.currentStock - b.currentStock);
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getStockableById(entityType: StockableType, id: string): Promise<Stockable> {
    if (entityType === 'INGREDIENT') {
      const row = await this.prisma.ingredient.findUnique({ where: { id } });
      if (!row) throw new NotFoundException(`Ingredient ${id} not found`);
      const current = await this.getCurrentStock('INGREDIENT', id);
      return ingredientToStockable(row, current);
    }
    if (entityType === 'SUBPRODUCT') {
      const row = await this.prisma.subproduct.findUnique({ where: { id } });
      if (!row) throw new NotFoundException(`Subproduct ${id} not found`);
      const current = await this.getCurrentStock('SUBPRODUCT', id);
      return subproductToStockable(row, current);
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
    } else if (input.entityType === 'SUBPRODUCT') {
      const sub = await this.prisma.subproduct.findUnique({
        where: { id: input.subproductId! },
        select: { id: true, isActive: true },
      });
      if (!sub) throw new NotFoundException(`Subproduct ${input.subproductId} not found`);
      if (!sub.isActive) {
        throw new BadRequestException(`Subproduct ${input.subproductId} is inactive`);
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

    // "Stock inicial" es la carga única al arrancar el sistema. Un segundo
    // INITIAL corrompería el significado del ledger → se rechaza. Las
    // correcciones posteriores van como MANUAL_ADJUSTMENT compensatorio.
    if (input.type === 'INITIAL') {
      const existingInitial = await this.prisma.inventoryMovement.findFirst({
        where: {
          type: 'INITIAL',
          ...(input.entityType === 'INGREDIENT'
            ? { ingredientId: input.ingredientId! }
            : input.entityType === 'SUBPRODUCT'
              ? { subproductId: input.subproductId! }
              : { productId: input.productId! }),
        },
        select: { id: true },
      });
      if (existingInitial) {
        throw new BadRequestException(
          'Este item ya tiene un "Stock inicial" registrado. Para corregir el stock usá un ajuste manual.',
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
          subproductId: input.entityType === 'SUBPRODUCT' ? input.subproductId : null,
          delta: input.delta,
          // El costo solo aplica a entradas (delta > 0); en consumos lo resuelve FIFO.
          unitCost: input.delta > 0 ? (input.unitCost ?? null) : null,
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

  /**
   * Anula (total o parcialmente) una merma registrada por error.
   *
   * `inventory_movements` es insert-only, así que la corrección es un
   * movimiento compensatorio con `sourceType='waste_reversal'` apuntando al id
   * de la merma original. El ledger FIFO lo reconoce y devuelve las unidades
   * con su base de costo REAL, neteando la pérdida en el P&G — un
   * `MANUAL_ADJUSTMENT` suelto devolvía la cantidad pero dejaba el costo
   * restando del neto para siempre, sin camino de corrección.
   *
   * Reversas parciales acumulables: el dueño puede devolver de a poco, pero
   * nunca más de lo que se tiró.
   */
  async reverseWaste(
    movementId: string,
    input: { reason: string; quantity?: number | null },
    userId: string,
  ): Promise<InventoryMovement> {
    const original = await this.prisma.inventoryMovement.findUnique({
      where: { id: movementId },
      select: {
        id: true,
        type: true,
        delta: true,
        entityType: true,
        ingredientId: true,
        productId: true,
        subproductId: true,
      },
    });
    if (!original) throw new NotFoundException(`Movimiento ${movementId} no encontrado`);
    if (original.type !== 'WASTE') {
      throw new BadRequestException(
        'Solo se anulan movimientos de MERMA. Para corregir otro movimiento usá un ajuste manual.',
      );
    }

    const wasted = Math.abs(Number(original.delta));
    // Lo ya devuelto por reversas previas (acumulables).
    const prior = await this.prisma.inventoryMovement.aggregate({
      where: { sourceType: 'waste_reversal', sourceId: movementId },
      _sum: { delta: true },
    });
    const alreadyReturned = Number(prior._sum.delta ?? 0);
    const pending = roundCost(wasted - alreadyReturned);
    if (pending <= 0) {
      throw new BadRequestException('Esta merma ya fue anulada por completo.');
    }

    const requested = input.quantity ?? pending;
    if (requested > pending + 1e-9) {
      throw new BadRequestException(
        `No se puede devolver ${requested}: la merma tiene ${pending} sin anular.`,
      );
    }
    const delta = roundCost(requested);
    if (roundsToZeroAt4(delta)) {
      throw new BadRequestException('La cantidad a devolver redondea a cero.');
    }

    const created = await this.prisma.inventoryMovement.create({
      data: {
        entityType: original.entityType,
        ingredientId: original.ingredientId,
        productId: original.productId,
        subproductId: original.subproductId,
        delta,
        // El costo lo resuelve el ledger devolviendo los lotes originales.
        unitCost: null,
        type: 'MANUAL_ADJUSTMENT',
        sourceType: 'waste_reversal',
        sourceId: movementId,
        notes: `Anulación de merma: ${input.reason}`.slice(0, 500),
        userId,
      },
      include: includeFull(),
    });
    return toMovementDto(created);
  }

  async listMovements(filter: ListMovementsFilter = {}): Promise<InventoryMovement[]> {
    const where: Prisma.InventoryMovementWhereInput = {};
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.ingredientId) where.ingredientId = filter.ingredientId;
    if (filter.productId) where.productId = filter.productId;
    if (filter.subproductId) where.subproductId = filter.subproductId;
    if (filter.type) where.type = filter.type as Prisma.InventoryMovementWhereInput['type'];
    if (filter.sourceType) where.sourceType = filter.sourceType;
    if (filter.sourceId) where.sourceId = filter.sourceId;
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
    subproduct: { select: { name: true } },
    user: { select: { fullName: true } },
  } satisfies Prisma.InventoryMovementInclude;
}

/** Porciones disponibles = stock ÷ porción (2 decimales). Null si no hay porción. */
function portionsOf(portionSize: unknown, current: number): number | null {
  if (portionSize === null || portionSize === undefined) return null;
  const size = Number(portionSize);
  if (!(size > 0)) return null;
  return Math.round((current / size) * 100) / 100;
}

function ingredientToStockable(row: DbIngredient, current: number): Stockable {
  const thresholdMin = Number(row.thresholdMin);
  const portionSize = row.portionSize !== null ? Number(row.portionSize) : null;
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
    blocksAvailability: row.blocksAvailability,
    portionSize,
    portions: portionsOf(portionSize, current),
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
    // Reventa directa: su stock ES lo que se vende → nunca es un consumible.
    blocksAvailability: true,
    // Reventa directa: se vende por unidad, no aplica "porciones".
    portionSize: null,
    portions: null,
    category: row.category,
    basePrice: Number(row.basePrice),
  };
}

function subproductToStockable(row: DbSubproduct, current: number): Stockable {
  const thresholdMin = Number(row.thresholdMin);
  return {
    type: 'SUBPRODUCT',
    id: row.id,
    name: row.name,
    // Subproducto: unidad de stock = unidad de "compra" = unit del subproducto
    // (no se compra, se produce internamente). conversionFactor=1 siempre.
    unitStock: row.unit,
    unitPurchase: row.unit,
    conversionFactor: 1,
    thresholdMin,
    isActive: row.isActive,
    currentStock: current,
    lowStock: row.isActive && current < thresholdMin,
    blocksAvailability: row.blocksAvailability,
    portionSize: row.portionSize !== null ? Number(row.portionSize) : null,
    portions: portionsOf(row.portionSize, current),
    category: null,
    basePrice: null,
  };
}

function toMovementDto(row: DbInventoryMovement): InventoryMovement {
  const itemName =
    row.entityType === 'INGREDIENT' ? row.ingredient?.name
    : row.entityType === 'PRODUCT' ? row.product?.name
    : row.subproduct?.name;
  return {
    id: row.id,
    entityType: row.entityType,
    ingredientId: row.ingredientId,
    productId: row.productId,
    subproductId: row.subproductId,
    itemName: itemName ?? undefined,
    delta: Number(row.delta),
    unitCost: row.unitCost !== null ? Number(row.unitCost) : null,
    type: row.type as InventoryMovement['type'],
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    userId: row.userId,
    userFullName: row.user?.fullName ?? null,
    notes: row.notes,
    evidenceUrl: row.evidenceKey ? `/api/subproducts/production/${row.sourceId}/evidence` : null,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}
