import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PromotionDef } from '@pos-tercos/domain';
import type {
  CreatePromotion,
  Promotion,
  PromotionChannel,
  PublicMenuPromotion,
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

/** Canal desde el que se origina una venta/lectura de promos (BOTH matchea ambos). */
export type SaleChannel = Exclude<PromotionChannel, 'BOTH'>;

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==================================================================
  // READ
  // ==================================================================

  async list(
    opts: { onlyActive?: boolean; channel?: SaleChannel } = {},
  ): Promise<Promotion[]> {
    const where: Prisma.PromotionWhereInput = {};
    if (opts.onlyActive) where.isActive = true;
    if (opts.channel) where.channel = { in: ['BOTH', opts.channel] };
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
   * por `is_active=true`, rango de fechas y CANAL (caja o web; BOTH entra en
   * ambos). El motor de domain hace el match fino (day-of-week + time window
   * + productId).
   *
   * Usado por `SalesService` al crear venta (COUNTER → POS, WEB_PICKUP → WEB).
   */
  async loadActiveAt(at: Date, channel: SaleChannel): Promise<PromotionDef[]> {
    const rows = await this.loadActiveRows(at, channel);
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      discountPct: r.discountPct === null ? undefined : Number(r.discountPct),
      discountFixed:
        r.discountFixed === null ? undefined : Number(r.discountFixed),
      bogoBuyQty: r.bogoBuyQty ?? undefined,
      bogoGetQty: r.bogoGetQty ?? undefined,
      daysOfWeekMask: r.daysOfWeekMask,
      timeStart: r.timeStart,
      timeEnd: r.timeEnd,
      // @db.Date (medianoche UTC) → día calendario `YYYY-MM-DD` sin ambigüedad.
      activeFrom: r.activeFrom ? toDateString(r.activeFrom) : null,
      activeTo: r.activeTo ? toDateString(r.activeTo) : null,
      productIds: new Set(r.products.map((pp) => pp.productId)),
    }));
  }

  /**
   * Promos activas del canal WEB en shape público (subset SAFE) para el menú
   * online. La web calcula el precio con descuento client-side con el mismo
   * motor de domain, igual que el POS.
   */
  async loadPublicActive(at: Date): Promise<PublicMenuPromotion[]> {
    const rows = await this.loadActiveRows(at, 'WEB');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      discountPct: r.discountPct === null ? null : Number(r.discountPct),
      discountFixed:
        r.discountFixed === null ? null : Number(r.discountFixed),
      bogoBuyQty: r.bogoBuyQty,
      bogoGetQty: r.bogoGetQty,
      daysOfWeekMask: r.daysOfWeekMask,
      timeStart: r.timeStart,
      timeEnd: r.timeEnd,
      activeFrom: r.activeFrom ? toDateString(r.activeFrom) : null,
      activeTo: r.activeTo ? toDateString(r.activeTo) : null,
      productIds: r.products.map((pp) => pp.productId),
    }));
  }

  private loadActiveRows(at: Date, channel: SaleChannel) {
    const dayKey = startOfDay(at);
    return this.prisma.promotion.findMany({
      where: {
        isActive: true,
        channel: { in: ['BOTH', channel] },
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: dayKey } }] },
          { OR: [{ activeTo: null }, { activeTo: { gte: dayKey } }] },
        ],
      },
      include: { products: { select: { productId: true } } },
    });
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
          discountPct: input.discountPct ?? null,
          discountFixed: input.discountFixed ?? null,
          bogoBuyQty: input.bogoBuyQty ?? null,
          bogoGetQty: input.bogoGetQty ?? null,
          daysOfWeekMask: input.daysOfWeekMask,
          timeStart: input.timeStart,
          timeEnd: input.timeEnd,
          activeFrom: input.activeFrom ? new Date(input.activeFrom) : null,
          activeTo: input.activeTo ? new Date(input.activeTo) : null,
          channel: input.channel,
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
        type: created.type,
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
          ...(input.daysOfWeekMask !== undefined && { daysOfWeekMask: input.daysOfWeekMask }),
          ...(input.timeStart !== undefined && { timeStart: input.timeStart }),
          ...(input.timeEnd !== undefined && { timeEnd: input.timeEnd }),
          ...(input.activeFrom !== undefined && {
            activeFrom: input.activeFrom ? new Date(input.activeFrom) : null,
          }),
          ...(input.activeTo !== undefined && {
            activeTo: input.activeTo ? new Date(input.activeTo) : null,
          }),
          ...(input.channel !== undefined && { channel: input.channel }),
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

/**
 * Día calendario LOCAL de `d` en medianoche UTC — coherente con activeFrom /
 * activeTo (@db.Date, medianoche UTC). Con medianoche LOCAL (+05:00 en Bogotá)
 * la comparación `activeTo >= dayKey` fallaba y la promo moría un día antes.
 */
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
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
    discountPct: row.discountPct === null ? null : Number(row.discountPct),
    discountFixed:
      row.discountFixed === null ? null : Number(row.discountFixed),
    bogoBuyQty: row.bogoBuyQty,
    bogoGetQty: row.bogoGetQty,
    daysOfWeekMask: row.daysOfWeekMask,
    timeStart: row.timeStart,
    timeEnd: row.timeEnd,
    activeFrom: row.activeFrom ? toDateString(row.activeFrom) : null,
    activeTo: row.activeTo ? toDateString(row.activeTo) : null,
    channel: row.channel,
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
