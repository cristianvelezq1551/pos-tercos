import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { roundMoney, roundsToZeroAt4 } from '@pos-tercos/domain';
import type {
  CortesiaGivenSummary,
  CortesiaRequest,
  CortesiaStatus,
  CreateCortesia,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BusinessConfigService } from '../business-config/business-config.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { CogsService } from '../reports/cogs.service';
import { SalesConsumptionService } from '../sales/sales-consumption.service';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

type Row = Prisma.CortesiaRequestGetPayload<object>;

/**
 * Cortesías: un producto regalado (línea de un pedido o suelto). El cajero la
 * SOLICITA y queda PENDING (sin tocar stock). Un admin/dueño la APRUEBA —recién
 * ahí se descuenta el stock a costo FIFO— o la rechaza (no toca stock) en el
 * panel de Solicitudes. El gasto a costo (COGS) se reconoce sobre las APROBADAS.
 */
@Injectable()
export class CortesiasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly recipes: RecipesService,
    private readonly consumption: SalesConsumptionService,
    private readonly ownerNotifications: OwnerNotificationService,
    private readonly cogs: CogsService,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  /**
   * Total dado en cortesías del mes de NEGOCIO — costo FIFO, idéntico a la
   * línea "Cortesías" del estado financiero (misma ventana, misma valuación).
   */
  async givenSummaryForMonth(year: number, month1: number): Promise<CortesiaGivenSummary> {
    const month0 = month1 - 1;
    // Misma ventana (hora local, fuente única en BusinessConfigService) que el
    // estado financiero → el KPI y el P&G coinciden siempre.
    const { from: monthStart, to: monthEnd } =
      await this.businessConfig.getBusinessMonthWindow(year, month1);
    const { total, count, unknownQty } = await this.cogs.getApprovedCortesiaCost(
      monthStart,
      monthEnd,
    );
    return {
      year,
      month: month1,
      monthLabel: `${MONTHS_ES[month0]} ${year}`,
      total,
      count,
      partial: unknownQty > 0,
    };
  }

  async create(input: CreateCortesia, userId: string): Promise<CortesiaRequest> {
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true, basePrice: true, comboPrice: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // Si se ata a una venta, verificá que exista — así el audit trail nunca
    // apunta a un saleId fantasma.
    if (input.saleId) {
      const sale = await this.prisma.sale.findUnique({
        where: { id: input.saleId },
        select: { id: true },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
    }

    // Costo de referencia para mostrar (estimado expanded-cost). El costo REAL
    // que pega al estado financiero se calcula a FIFO cuando se APRUEBA (al
    // materializarse el consumo). Solicitar NO descuenta stock.
    const cost = await this.recipes
      .expandedCost(input.productId, input.sizeId ?? undefined)
      .catch(() => null);
    const unitCost = cost?.totalCost ?? null;
    const costAmount = unitCost !== null ? roundMoney(unitCost * input.quantity) : null;
    const unitPrice = Number(product.basePrice ?? 0) || Number(product.comboPrice ?? 0);
    const salePrice = roundMoney(unitPrice * input.quantity);

    const created = await this.prisma.cortesiaRequest.create({
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
    const out = await this.toDtos(rows);
    // Las autorizadas muestran su COSTO FIFO REAL (mismo libro que el P&G).
    if (out.some((c) => c.status === 'APPROVED')) {
      const bySource = await this.cogs.getCortesiaCostBySource();
      for (const c of out) {
        if (c.status === 'APPROVED') c.fifoCost = bySource.get(c.id)?.cost ?? null;
      }
    }
    return out;
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

    // AUTORIZAR = la cortesía es real → recién acá se descuenta el stock (un
    // nivel, igual que una venta). El ledger FIFO lo valúa a costo y lo lleva a
    // su bucket de cortesías. RECHAZAR no toca stock (nunca se descontó).
    let movements: Prisma.InventoryMovementCreateManyInput[] = [];
    if (status === 'APPROVED') {
      const specs = await this.consumption.computeConsumptionSpecs(
        [
          {
            productId: existing.productId,
            quantity: existing.quantity,
            sizeId: existing.sizeId ?? null,
            modifiers: [],
          },
        ],
        'Cortesía',
      );
      // Descartar consumos que redondean a 0 en Decimal(_,4): un delta=0 viola
      // el CHECK `delta <> 0` y abortaría toda la aprobación con un error opaco.
      movements = specs
        .filter((s) => !roundsToZeroAt4(s.delta))
        .map((s) => ({
          entityType: s.entityType,
          ingredientId: s.ingredientId ?? null,
          productId: s.productId ?? null,
          subproductId: s.subproductId ?? null,
          delta: s.delta,
          type: 'MANUAL_ADJUSTMENT',
          sourceType: 'cortesia',
          sourceId: id,
          userId,
          notes: `Cortesía: ${existing.reason}`.slice(0, 200),
        }));
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Guard atómico contra TOCTOU: el claim solo prospera si SIGUE en PENDING.
      // Dos aprobaciones concurrentes (dos tabs / reintento) competían por pasar
      // el chequeo de afuera y ambas descontaban stock + reconocían COGS doble.
      const claim = await tx.cortesiaRequest.updateMany({
        where: { id, status: 'PENDING' },
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
      if (claim.count === 0) {
        // Otro resolvió la cortesía entre nuestra lectura y el claim → abortamos
        // (rollback de cualquier movement) para no duplicar el descuento.
        throw new BadRequestException('La cortesía ya fue resuelta.');
      }
      if (movements.length > 0) {
        // No bloqueamos por stock: el producto ya se entregó; el FIFO valúa lo
        // que haya y marca el resto como costo desconocido (nunca asume $0).
        await tx.inventoryMovement.createMany({ data: movements });
      }
      return tx.cortesiaRequest.findUniqueOrThrow({ where: { id } });
    });
    await this.audit.log({
      userId,
      action: status === 'APPROVED' ? 'CORTESIA_APPROVED' : 'CORTESIA_REJECTED',
      entityType: 'cortesia',
      entityId: id,
      metadata: {
        costAmount: existing.costAmount ? Number(existing.costAmount) : null,
        note: note ?? null,
        movementsCreated: movements.length,
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
