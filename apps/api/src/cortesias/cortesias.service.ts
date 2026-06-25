import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { roundMoney } from '@pos-tercos/domain';
import type { CortesiaRequest, CortesiaStatus, CreateCortesia } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { SalesConsumptionService } from '../sales/sales-consumption.service';

type Row = Prisma.CortesiaRequestGetPayload<object>;

/**
 * Cortesías: un producto regalado (línea de un pedido o suelto). El cajero la
 * SOLICITA — el stock se descuenta al instante (el producto ya se entregó) y
 * queda PENDING. Un admin/dueño la confirma o rechaza en el panel de
 * Solicitudes. El gasto a costo (COGS) se reconoce sobre las APROBADAS.
 */
@Injectable()
export class CortesiasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly recipes: RecipesService,
    private readonly consumption: SalesConsumptionService,
    private readonly ownerNotifications: OwnerNotificationService,
  ) {}

  async create(input: CreateCortesia, userId: string): Promise<CortesiaRequest> {
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true, basePrice: true, comboPrice: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // COGS snapshot (costo real estimado, mismo cálculo que expanded-cost).
    const cost = await this.recipes
      .expandedCost(input.productId, input.sizeId ?? undefined)
      .catch(() => null);
    const unitCost = cost?.totalCost ?? null;
    const costAmount = unitCost !== null ? roundMoney(unitCost * input.quantity) : null;
    const unitPrice = Number(product.basePrice ?? 0) || Number(product.comboPrice ?? 0);
    const salePrice = roundMoney(unitPrice * input.quantity);

    // El producto regalado consume stock igual que una venta (un nivel).
    const specs = await this.consumption.computeConsumptionSpecs(
      [
        {
          productId: input.productId,
          quantity: input.quantity,
          sizeId: input.sizeId ?? null,
          modifiers: [],
        },
      ],
      'Cortesía',
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const req = await tx.cortesiaRequest.create({
        data: {
          status: 'PENDING',
          saleId: input.saleId ?? null,
          productId: input.productId,
          sizeId: input.sizeId ?? null,
          quantity: input.quantity,
          reason: input.reason,
          costAmount,
          salePrice,
          requestedById: userId,
        },
      });
      const movements: Prisma.InventoryMovementCreateManyInput[] = specs.map((s) => ({
        entityType: s.entityType,
        ingredientId: s.ingredientId ?? null,
        productId: s.productId ?? null,
        subproductId: s.subproductId ?? null,
        delta: s.delta,
        type: 'MANUAL_ADJUSTMENT',
        sourceType: 'cortesia',
        sourceId: req.id,
        userId,
        notes: `Cortesía: ${input.reason}`.slice(0, 200),
      }));
      if (movements.length > 0) {
        await this.consumption.assertStockSufficient(tx, movements);
        await tx.inventoryMovement.createMany({ data: movements });
      }
      return req;
    });

    await this.audit.log({
      userId,
      action: 'CORTESIA_REQUESTED',
      entityType: 'cortesia',
      entityId: created.id,
      metadata: { productId: input.productId, quantity: input.quantity, costAmount, salePrice, reason: input.reason },
    });
    void this.ownerNotifications.alert(
      'cortesia_request',
      `Cortesía solicitada: ${input.quantity}x ${product.name} — ${input.reason}`,
      { cortesiaId: created.id },
    );

    return (await this.toDtos([created]))[0]!;
  }

  async list(status?: CortesiaStatus[]): Promise<CortesiaRequest[]> {
    const rows = await this.prisma.cortesiaRequest.findMany({
      where: status && status.length > 0 ? { status: { in: status } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return this.toDtos(rows);
  }

  /** Cortesías del cajero (para que vea el estado y acuse las observadas). */
  async listMine(userId: string): Promise<CortesiaRequest[]> {
    const rows = await this.prisma.cortesiaRequest.findMany({
      where: { requestedById: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.toDtos(rows);
  }

  /** El cajero acusa una cortesía observada (deja de avisar). */
  async ack(id: string, userId: string): Promise<CortesiaRequest> {
    const existing = await this.prisma.cortesiaRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cortesía no encontrada');
    if (existing.requestedById !== userId) {
      throw new BadRequestException('Solo quien la registró puede marcarla vista.');
    }
    const updated = await this.prisma.cortesiaRequest.update({
      where: { id },
      data: { seenByRequester: true },
    });
    return (await this.toDtos([updated]))[0]!;
  }

  approve(id: string, userId: string, note?: string): Promise<CortesiaRequest> {
    return this.resolve(id, 'APPROVED', userId, note);
  }

  reject(id: string, userId: string, note?: string): Promise<CortesiaRequest> {
    return this.resolve(id, 'REJECTED', userId, note);
  }

  private async resolve(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    userId: string,
    note?: string,
  ): Promise<CortesiaRequest> {
    const existing = await this.prisma.cortesiaRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cortesía no encontrada');
    if (existing.status !== 'PENDING') {
      throw new BadRequestException(`La cortesía ya fue ${existing.status === 'APPROVED' ? 'aprobada' : 'rechazada'}.`);
    }

    // Rechazar = no fue una cortesía real → revertir el stock que se descontó al
    // crearla (movimientos compensatorios, insert-only). Autorizar deja el
    // consumo (el producto se regaló de verdad) y se contabiliza el costo.
    const reverseMovements: Prisma.InventoryMovementCreateManyInput[] = [];
    if (status === 'REJECTED') {
      const originals = await this.prisma.inventoryMovement.findMany({
        where: { sourceType: 'cortesia', sourceId: id },
      });
      for (const o of originals) {
        reverseMovements.push({
          entityType: o.entityType,
          ingredientId: o.ingredientId,
          productId: o.productId,
          subproductId: o.subproductId,
          delta: Number(o.delta) * -1,
          type: 'MANUAL_ADJUSTMENT',
          sourceType: 'cortesia',
          sourceId: id,
          userId,
          notes: 'Reverso de cortesía rechazada',
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (reverseMovements.length > 0) {
        await tx.inventoryMovement.createMany({ data: reverseMovements });
      }
      return tx.cortesiaRequest.update({
        where: { id },
        data: {
          status,
          resolvedById: userId,
          resolvedAt: new Date(),
          resolverNote: note ?? null,
          // Toda resolución es novedad para el cajero: el POS le muestra un toast.
          // El acuse lo da el toast (autorizada: auto; observada: explícito).
          seenByRequester: false,
        },
      });
    });
    await this.audit.log({
      userId,
      action: status === 'APPROVED' ? 'CORTESIA_APPROVED' : 'CORTESIA_REJECTED',
      entityType: 'cortesia',
      entityId: id,
      metadata: {
        costAmount: existing.costAmount ? Number(existing.costAmount) : null,
        note: note ?? null,
        movementsReversed: reverseMovements.length,
      },
    });
    return (await this.toDtos([updated]))[0]!;
  }

  private async toDtos(rows: Row[]): Promise<CortesiaRequest[]> {
    const productIds = uniq(rows.map((r) => r.productId));
    const sizeIds = uniq(rows.map((r) => r.sizeId).filter((x): x is string => !!x));
    const userIds = uniq(
      rows.flatMap((r) => [r.requestedById, r.resolvedById]).filter((x): x is string => !!x),
    );
    const [products, sizes, users] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
      sizeIds.length
        ? this.prisma.productSize.findMany({ where: { id: { in: sizeIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
    ]);
    const productName = new Map(products.map((p) => [p.id, p.name]));
    const sizeName = new Map(sizes.map((s) => [s.id, s.name]));
    const userName = new Map(users.map((u) => [u.id, u.fullName]));

    return rows.map((r) => ({
      id: r.id,
      status: r.status as CortesiaStatus,
      saleId: r.saleId,
      productId: r.productId,
      productName: productName.get(r.productId) ?? null,
      sizeId: r.sizeId,
      sizeName: r.sizeId ? (sizeName.get(r.sizeId) ?? null) : null,
      quantity: r.quantity,
      reason: r.reason,
      costAmount: r.costAmount !== null ? Number(r.costAmount) : null,
      salePrice: Number(r.salePrice),
      requestedById: r.requestedById,
      requestedByName: userName.get(r.requestedById) ?? null,
      resolvedById: r.resolvedById,
      resolvedByName: r.resolvedById ? (userName.get(r.resolvedById) ?? null) : null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolverNote: r.resolverNote,
      seenByRequester: r.seenByRequester,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
