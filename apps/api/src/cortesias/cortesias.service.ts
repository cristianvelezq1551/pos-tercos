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
      select: { id: true, name: true, basePrice: true, comboPrice: true, isCombo: true },
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
    // Precio de venta unitario espejando computeLine: en combos gana comboPrice,
    // y se suma el modificador del talle si aplica (antes usaba basePrice a secas
    // y omitía el talle → subreportaba el valor comercial regalado).
    let unitPrice =
      product.isCombo && product.comboPrice !== null
        ? Number(product.comboPrice)
        : Number(product.basePrice ?? 0);
    if (input.sizeId) {
      const size = await this.prisma.productSize.findUnique({
        where: { id: input.sizeId },
        select: { priceModifier: true, productId: true },
      });
      if (size && size.productId === product.id) {
        unitPrice += Number(size.priceModifier);
      }
    }
    const salePrice = roundMoney(unitPrice * input.quantity);

    // Auto-aprobada: la cortesía es efectiva al registrarse (sin gate de admin).
    // Se descuenta el stock a costo FIFO en la MISMA tx que la crea; el ledger la
    // valúa y la lleva a su bucket de cortesías. Un fallo de stock no bloquea (el
    // producto ya se entregó): el FIFO marca lo que falte como costo desconocido.
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cortesiaRequest.create({
        data: {
          status: 'APPROVED',
          saleId: input.saleId ?? null,
          productId: input.productId,
          sizeId: input.sizeId ?? null,
          quantity: input.quantity,
          reason: input.reason,
          costAmount,
          salePrice,
          requestedById: userId,
          resolvedById: userId,
          resolvedAt: new Date(),
        },
      });
      const movements = await this.buildCortesiaMovements(row.id, input, userId);
      if (movements.length > 0) {
        await tx.inventoryMovement.createMany({ data: movements });
      }
      return row;
    });

    await this.audit.log({
      userId,
      action: 'CORTESIA_APPROVED',
      entityType: 'cortesia',
      entityId: created.id,
      metadata: { productId: input.productId, quantity: input.quantity, costAmount, salePrice, reason: input.reason, auto: true },
    });
    void this.ownerNotifications.alert(
      'cortesia_given',
      `Cortesía registrada: ${input.quantity}x ${product.name} — ${input.reason}`,
      { cortesiaId: created.id },
    );

    return (await this.toDtos([created]))[0]!;
  }

  /**
   * Movimientos de inventario (un nivel, igual que una venta) para descontar el
   * stock de una cortesía. Descarta consumos que redondean a 0 en Decimal(_,4):
   * un delta=0 viola el CHECK `delta <> 0` y abortaría toda la tx.
   */
  private async buildCortesiaMovements(
    cortesiaId: string,
    input: Pick<CreateCortesia, 'productId' | 'quantity' | 'sizeId'> & { reason: string },
    userId: string,
  ): Promise<Prisma.InventoryMovementCreateManyInput[]> {
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
    return specs
      .filter((s) => !roundsToZeroAt4(s.delta))
      .map((s) => ({
        entityType: s.entityType,
        ingredientId: s.ingredientId ?? null,
        productId: s.productId ?? null,
        subproductId: s.subproductId ?? null,
        delta: s.delta,
        type: 'MANUAL_ADJUSTMENT',
        sourceType: 'cortesia',
        sourceId: cortesiaId,
        userId,
        notes: `Cortesía: ${input.reason}`.slice(0, 200),
      }));
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

    // Flujo LEGACY: resuelve filas históricas que quedaron en PENDING del modelo
    // anterior de aprobación. AUTORIZAR descuenta el stock (un nivel, como una
    // venta); RECHAZAR no toca stock (nunca se descontó). Las cortesías nuevas
    // ya nacen APPROVED desde `create`, así que esto solo aplica a datos viejos.
    const movements =
      status === 'APPROVED'
        ? await this.buildCortesiaMovements(
            id,
            {
              productId: existing.productId,
              quantity: existing.quantity,
              sizeId: existing.sizeId,
              reason: existing.reason,
            },
            userId,
          )
        : [];

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

  /**
   * El admin ANULA una cortesía autorizada registrada por error: devuelve el
   * stock descontado y la saca del COGS de cortesías (el reporte filtra por
   * status='APPROVED', así que REVERSED deja de contar). Los movimientos
   * compensatorios (`sourceType='cortesia_reversal'`) restauran la cantidad y
   * el ledger FIFO les devuelve la base de costo ORIGINAL (los draws de la
   * cortesía quedan registrados en el replay — ver run-ledger.ts). Solo
   * revierte cortesías APPROVED (las nuevas nacen así).
   */
  async reverse(id: string, userId: string, note?: string): Promise<CortesiaRequest> {
    const existing = await this.prisma.cortesiaRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cortesía no encontrada');
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException('Solo se pueden anular cortesías autorizadas.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Claim TOCTOU-safe: solo prospera si SIGUE APPROVED (evita doble reversa).
      const claim = await tx.cortesiaRequest.updateMany({
        where: { id, status: 'APPROVED' },
        data: {
          status: 'REVERSED',
          resolvedById: userId,
          resolvedAt: new Date(),
          resolverNote: note ?? null,
          seenByRequester: false,
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('La cortesía ya fue anulada.');
      }
      // Movimientos originales del descuento → compensar por NETO (delta invertido)
      // para devolver EXACTAMENTE lo que se descontó, sin violar delta<>0.
      const originals = await tx.inventoryMovement.findMany({
        where: { sourceType: 'cortesia', sourceId: id },
        select: { entityType: true, ingredientId: true, productId: true, subproductId: true, delta: true },
      });
      const netByStockable = new Map<string, Prisma.InventoryMovementCreateManyInput>();
      for (const o of originals) {
        const k = `${o.entityType}:${o.ingredientId ?? ''}:${o.productId ?? ''}:${o.subproductId ?? ''}`;
        const cur = netByStockable.get(k);
        if (cur) {
          cur.delta = Number(cur.delta) - Number(o.delta);
        } else {
          netByStockable.set(k, {
            entityType: o.entityType,
            ingredientId: o.ingredientId,
            productId: o.productId,
            subproductId: o.subproductId,
            delta: -Number(o.delta),
            type: 'MANUAL_ADJUSTMENT',
            sourceType: 'cortesia_reversal',
            sourceId: id,
            userId,
            notes: `Anulación cortesía: ${note ?? existing.reason}`.slice(0, 200),
          });
        }
      }
      const reverseMovements = [...netByStockable.values()].filter(
        (m) => !roundsToZeroAt4(Number(m.delta)),
      );
      if (reverseMovements.length > 0) {
        await tx.inventoryMovement.createMany({ data: reverseMovements });
      }
      return tx.cortesiaRequest.findUniqueOrThrow({ where: { id } });
    });

    await this.audit.log({
      userId,
      action: 'CORTESIA_REVERSED',
      entityType: 'cortesia',
      entityId: id,
      metadata: {
        costAmount: existing.costAmount ? Number(existing.costAmount) : null,
        note: note ?? null,
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
