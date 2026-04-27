import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PromotionDef } from '@pos-tercos/domain';
import type {
  CreatePromotion,
  Promotion,
  UpdatePromotion,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type DbPromotionWithRelations = Prisma.PromotionGetPayload<{
  include: {
    products: { select: { productId: true } };
    createdBy: { select: { fullName: true } };
  };
}>;

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==================================================================
  // READ
  // ==================================================================

  async list(opts: { onlyActive?: boolean } = {}): Promise<Promotion[]> {
    const where: Prisma.PromotionWhereInput = {};
    if (opts.onlyActive) where.isActive = true;
    const rows = await this.prisma.promotion.findMany({
      where,
      include: includeFull(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPromotionDto);
  }

  async getById(id: string): Promise<Promotion> {
    const row = await this.prisma.promotion.findUnique({
      where: { id },
      include: includeFull(),
    });
    if (!row) throw new NotFoundException(`Promotion ${id} not found`);
    return toPromotionDto(row);
  }

  /**
   * Carga las promociones que podrían aplicar a una venta en `at`. Pre-filtra
   * por `is_active=true` y rango de fechas. El motor de domain hace el match
   * fino (day-of-week + time window + productId).
   *
   * Usado por `SalesService` al crear venta.
   */
  async loadActiveAt(at: Date): Promise<PromotionDef[]> {
    const dayKey = startOfDay(at);
    const rows = await this.prisma.promotion.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: dayKey } }] },
          { OR: [{ activeTo: null }, { activeTo: { gte: dayKey } }] },
        ],
      },
      include: { products: { select: { productId: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      discountPct: Number(r.discountPct),
      daysOfWeekMask: r.daysOfWeekMask,
      timeStart: r.timeStart,
      timeEnd: r.timeEnd,
      activeFrom: r.activeFrom,
      activeTo: r.activeTo,
      productIds: new Set(r.products.map((pp) => pp.productId)),
    }));
  }

  // ==================================================================
  // WRITE
  // ==================================================================

  async create(input: CreatePromotion, userId: string): Promise<Promotion> {
    await this.assertProductsExist(input.productIds);

    const created = await this.prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.create({
        data: {
          name: input.name,
          type: input.type,
          discountPct: input.discountPct,
          daysOfWeekMask: input.daysOfWeekMask,
          timeStart: input.timeStart,
          timeEnd: input.timeEnd,
          activeFrom: input.activeFrom ? new Date(input.activeFrom) : null,
          activeTo: input.activeTo ? new Date(input.activeTo) : null,
          createdById: userId,
          products: {
            create: input.productIds.map((pid) => ({ productId: pid })),
          },
        },
        include: includeFull(),
      });
      return promo;
    });

    await this.audit.log({
      userId,
      action: 'PROMOTION_CREATED',
      entityType: 'promotion',
      entityId: created.id,
      metadata: {
        name: created.name,
        discountPct: Number(created.discountPct),
        productsCount: created.products.length,
      },
    });

    return toPromotionDto(created);
  }

  async update(
    id: string,
    input: UpdatePromotion,
    userId: string,
  ): Promise<Promotion> {
    const existing = await this.prisma.promotion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Promotion ${id} not found`);

    if (input.productIds) {
      await this.assertProductsExist(input.productIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.promotion.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.discountPct !== undefined && { discountPct: input.discountPct }),
          ...(input.daysOfWeekMask !== undefined && { daysOfWeekMask: input.daysOfWeekMask }),
          ...(input.timeStart !== undefined && { timeStart: input.timeStart }),
          ...(input.timeEnd !== undefined && { timeEnd: input.timeEnd }),
          ...(input.activeFrom !== undefined && {
            activeFrom: input.activeFrom ? new Date(input.activeFrom) : null,
          }),
          ...(input.activeTo !== undefined && {
            activeTo: input.activeTo ? new Date(input.activeTo) : null,
          }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });

      if (input.productIds) {
        await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
        await tx.promotionProduct.createMany({
          data: input.productIds.map((pid) => ({
            promotionId: id,
            productId: pid,
          })),
        });
      }

      return tx.promotion.findUniqueOrThrow({
        where: { id },
        include: includeFull(),
      });
    });

    await this.audit.log({
      userId,
      action: 'PROMOTION_UPDATED',
      entityType: 'promotion',
      entityId: id,
      metadata: { changedKeys: Object.keys(input) },
    });

    return toPromotionDto(updated);
  }

  async deactivate(id: string, userId: string): Promise<Promotion> {
    const existing = await this.prisma.promotion.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!existing) throw new NotFoundException(`Promotion ${id} not found`);
    if (!existing.isActive) {
      // No-op: ya está desactivada.
      const row = await this.prisma.promotion.findUniqueOrThrow({
        where: { id },
        include: includeFull(),
      });
      return toPromotionDto(row);
    }

    const updated = await this.prisma.promotion.update({
      where: { id },
      data: { isActive: false },
      include: includeFull(),
    });

    await this.audit.log({
      userId,
      action: 'PROMOTION_DEACTIVATED',
      entityType: 'promotion',
      entityId: id,
    });

    return toPromotionDto(updated);
  }

  // ==================================================================
  // HELPERS
  // ==================================================================

  private async assertProductsExist(productIds: string[]): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, isActive: true },
    });
    const existing = new Set(products.map((p) => p.id));
    const missing = productIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Productos no encontrados: ${missing.join(', ')}`,
      );
    }
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function includeFull() {
  return {
    products: { select: { productId: true } },
    createdBy: { select: { fullName: true } },
  } satisfies Prisma.PromotionInclude;
}

function toPromotionDto(row: DbPromotionWithRelations): Promotion {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    discountPct: Number(row.discountPct),
    daysOfWeekMask: row.daysOfWeekMask,
    timeStart: row.timeStart,
    timeEnd: row.timeEnd,
    activeFrom: row.activeFrom ? toDateString(row.activeFrom) : null,
    activeTo: row.activeTo ? toDateString(row.activeTo) : null,
    isActive: row.isActive,
    createdById: row.createdById,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    productIds: row.products.map((pp) => pp.productId),
  };
}

function toDateString(d: Date): string {
  // YYYY-MM-DD (formato `z.string().date()`)
  return d.toISOString().slice(0, 10);
}
