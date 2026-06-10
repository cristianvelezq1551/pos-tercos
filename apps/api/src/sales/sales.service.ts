import {
  BadRequestException,
  forwardRef,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyPromotion,
  buildVoidAlertMessage,
  roundMoney,
  type PromotionDef,
} from '@pos-tercos/domain';
import { DIGITAL_PAYMENT_METHODS } from '@pos-tercos/types';
import type {
  AppliedModifier,
  ConfirmPayment,
  CreateSale,
  CreateSaleItem,
  PaymentMethod,
  Sale,
  SaleStatus,
  SaleStatusLogEntry,
  Shift,
  VoidSale,
} from '@pos-tercos/types';
import type { Prisma, SaleStatus as DbSaleStatus } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { KdsGateway } from '../kds/kds.gateway';
import { NotificationService } from '../notifications/notification.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { ShiftsService } from '../shifts/shifts.service';
import { SalesConsumptionService } from './sales-consumption.service';
import { includeFull, toSaleDto } from './sales.mappers';

const SALES_CREATE_ENDPOINT = 'POST /sales';

interface ListSalesFilter {
  status?: SaleStatus;
  cashierId?: string;
  shiftId?: string;
  type?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly promotions: PromotionsService,
    private readonly consumption: SalesConsumptionService,
    @Inject(forwardRef(() => KdsGateway)) private readonly kdsGateway: KdsGateway,
    private readonly notifications: NotificationService,
    private readonly ownerNotifications: OwnerNotificationService,
    private readonly shifts: ShiftsService,
  ) {}

  // ==================================================================
  // CREATE
  // ==================================================================

  /**
   * Crea una venta en estado PENDIENTE_PAGO. NO descuenta stock todavía
   * — eso ocurre en `confirmPayment` cuando la venta efectivamente se cobra.
   *
   * Idempotency: si `idempotencyKey` ya está cacheada para POST /sales,
   * retorna la respuesta original. Cualquier reintento con la misma key
   * NO crea una segunda venta.
   *
   * Promociones: en FASE 5.B usa stub que retorna 0. Engine real en 5.C.
   */
  async create(
    input: CreateSale,
    cashierId: string,
    idempotencyKey?: string,
  ): Promise<Sale> {
    if (idempotencyKey) {
      const cached = await this.idempotency.findCached<Sale>(
        idempotencyKey,
        SALES_CREATE_ENDPOINT,
      );
      if (cached) {
        await this.audit.log({
          userId: cashierId,
          action: 'IDEMPOTENCY_HIT',
          entityType: 'sale',
          entityId: cached.body.id,
          metadata: { endpoint: SALES_CREATE_ENDPOINT, key: idempotencyKey },
        });
        return cached.body;
      }
    }

    // COUNTER requiere la caja del día abierta. Si quedó una caja OPEN de un
    // día anterior, getActiveTodayShift lanza Conflict → el cajero debe cerrarla
    // (Cerrar turno) antes de vender. WEB_* no exige turno (el cajero asigna
    // shift al confirmar el pago vía POS).
    let shift: Shift | null = null;
    if (input.type === 'COUNTER') {
      shift = await this.shifts.getActiveTodayShift(cashierId);
      if (!shift) {
        throw new BadRequestException(
          'No tenés un turno abierto. Abrí turno antes de vender (POST /shifts/open).',
        );
      }
    }

    // Cargar productos + sizes + modifiers + promociones activas en paralelo
    const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
    const now = new Date();
    const [products, activePromotions] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { sizes: true, modifiers: true },
      }),
      this.promotions.loadActiveAt(now),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validar + computar líneas (incluye motor de promociones puro)
    const computedItems: ComputedSaleItem[] = input.items.map((it) =>
      computeLine(it, productMap, activePromotions, now),
    );

    const subtotal = roundMoney(
      computedItems.reduce((acc, it) => acc + it.lineSubtotal, 0),
    );
    const discountTotal = roundMoney(
      computedItems.reduce((acc, it) => acc + it.lineDiscount, 0),
    );
    const total = roundMoney(subtotal - discountTotal);

    // turn_number NO se asigna al crear: se asigna al PAGAR (confirmPayment),
    // como secuencia diaria única compartida COUNTER + WEB_PICKUP. Así los
    // pedidos web abandonados sin pagar no consumen número (secuencia sin huecos).

    // Prisma no soporta default a nivel cliente para nextval con sequence
    // custom (ver schema.prisma comentario sobre receipt_number). Pedimos
    // el receipt_number con $queryRaw antes de la transacción.
    const [{ next }] = await this.prisma.$queryRaw<{ next: bigint }[]>`
      SELECT nextval('receipt_seq') AS next
    `;
    const receiptNumber = next;

    const newSaleId = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          receiptNumber,
          type: input.type,
          status: 'PENDIENTE_PAGO',
          turnNumber: null,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          customerNit: input.customerNit ?? null,
          subtotal,
          discountTotal,
          total,
          // WEB_* no tiene cashier ni shift hasta que el cajero confirme pago
          cashierId: input.type === 'COUNTER' ? cashierId : null,
          shiftId: input.type === 'COUNTER' ? shift!.id : null,
          notes: input.notes ?? null,
          idempotencyKey: idempotencyKey ?? null,
          items: {
            create: computedItems.map((c) => ({
              productId: c.productId,
              sizeId: c.sizeId,
              quantity: c.quantity,
              unitPrice: c.unitPrice,
              modifiersJson: c.modifiers as unknown as Prisma.InputJsonValue,
              notes: c.notes,
              appliedPromotionId: c.appliedPromotionId,
              lineSubtotal: c.lineSubtotal,
              lineDiscount: c.lineDiscount,
              lineTotal: c.lineTotal,
            })),
          },
          statusLog: {
            create: {
              statusFrom: null,
              statusTo: 'PENDIENTE_PAGO',
              userId: cashierId,
              notes: 'Venta creada',
            },
          },
        },
        select: { id: true },
      });
      return sale.id;
    });

    const created = await this.prisma.sale.findUniqueOrThrow({
      where: { id: newSaleId },
      include: includeFull(),
    });
    const dto = toSaleDto(created);

    if (idempotencyKey) {
      await this.idempotency.cache({
        key: idempotencyKey,
        endpoint: SALES_CREATE_ENDPOINT,
        body: dto,
        statusCode: 201,
        userId: cashierId,
      });
    }

    await this.audit.log({
      userId: cashierId,
      action: 'SALE_CREATED',
      entityType: 'sale',
      entityId: dto.id,
      metadata: {
        receiptNumber: dto.receiptNumber,
        total: dto.total,
        itemsCount: dto.items?.length ?? 0,
        shiftId: shift?.id ?? null,
        type: dto.type,
      },
    });

    return dto;
  }

  // ==================================================================
  // CONFIRM PAYMENT
  // ==================================================================

  async confirmPayment(
    saleId: string,
    input: ConfirmPayment,
    userId: string,
  ): Promise<Sale> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, shift: true },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    if (existing.status !== 'PENDIENTE_PAGO') {
      throw new BadRequestException(
        `Sale está en status ${existing.status}, no se puede cobrar (solo PENDIENTE_PAGO).`,
      );
    }
    const total = Number(existing.total);
    if (input.amountReceived < total - 0.005) {
      throw new BadRequestException(
        `Amount received (${input.amountReceived}) < total (${total})`,
      );
    }
    // Defensa server-side (no confiar solo en el Zod del controller): los pagos
    // digitales exigen monto exacto + doble verificación.
    const isDigital = (DIGITAL_PAYMENT_METHODS as readonly PaymentMethod[]).includes(
      input.method as PaymentMethod,
    );
    if (isDigital) {
      if (!input.digitalDoubleVerified) {
        throw new BadRequestException(
          `${input.method} requiere doble verificación (app del negocio + comprobante).`,
        );
      }
      if (Math.abs(input.amountReceived - total) > 0.005) {
        throw new BadRequestException(
          `Pago digital: el monto debe ser exacto al total (${total}).`,
        );
      }
    }

    // WEB_PICKUP entra sin turno; al confirmar el cajero le asocia SU turno
    // abierto (si no, la venta nunca entra al cierre de caja / Z-report).
    let shiftId = existing.shiftId;
    let cashierId = existing.cashierId;
    if (existing.type === 'WEB_PICKUP' && shiftId === null) {
      // getActiveTodayShift lanza Conflict si la caja quedó abierta de ayer →
      // el cajero debe cerrarla antes de confirmar pagos.
      const shift = await this.shifts.getActiveTodayShift(userId);
      if (!shift) {
        // Sin caja abierta la venta web quedaría con shiftId/cashierId null y
        // nunca entraría al cierre de caja (Z-report) ni a la atribución de
        // comisiones → descuadre silencioso. Igual que COUNTER, exigimos caja.
        throw new BadRequestException(
          'Abrí la caja antes de confirmar pagos web (la venta debe entrar al cierre de caja).',
        );
      }
      shiftId = shift.id;
      cashierId = userId;
    }

    // Consumo de stock: lógica ÚNICA compartida con syncOffline (reventa
    // directa / receta un nivel / combos por componentes).
    const consumptionSpecs = await this.consumption.computeConsumptionSpecs(
      existing.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        sizeId: it.sizeId,
      })),
      `Sale ${existing.id.slice(0, 8)}`,
    );
    const stockMovementsToCreate: Prisma.InventoryMovementCreateManyInput[] =
      consumptionSpecs.map((s) => ({
        entityType: s.entityType,
        ingredientId: s.ingredientId ?? null,
        productId: s.productId ?? null,
        subproductId: s.subproductId ?? null,
        delta: s.delta,
        type: 'SALE',
        sourceType: 'sale',
        sourceId: saleId,
        userId,
        notes: s.note,
      }));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Turno: secuencia ÚNICA por CAJA (no global). Resetea cada vez que se
      // abre una caja nueva → cada día empieza en #1, sin importar cuántos
      // pedidos hubo ayer. Cuenta los que ya tienen turno en ESTA caja + 1.
      // (Fallback a "hoy" si por algún motivo no hay caja asociada.)
      let assigned: number;
      if (shiftId) {
        assigned = await tx.sale.count({
          where: { shiftId, turnNumber: { not: null } },
        });
      } else {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        assigned = await tx.sale.count({
          where: { turnNumber: { not: null }, paidAt: { gte: startOfDay } },
        });
      }
      const turnNumber = assigned + 1;

      // Guard transaccional contra doble-cobro (doble-click / retry de red):
      // el status se condiciona DENTRO del UPDATE. Si otra request ya cobró,
      // count===0 y abortamos sin descontar stock dos veces.
      const res = await tx.sale.updateMany({
        where: { id: saleId, status: 'PENDIENTE_PAGO' },
        data: {
          status: 'PAGADO',
          paymentMethod: input.method as PaymentMethod,
          paidAt: new Date(),
          paidByUserId: userId,
          turnNumber,
          shiftId,
          cashierId,
        },
      });
      if (res.count === 0) {
        throw new BadRequestException(
          'La venta ya fue cobrada o cambió de estado.',
        );
      }
      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: 'PENDIENTE_PAGO',
          statusTo: 'PAGADO',
          userId,
          notes: input.notes ?? `Cobro ${input.method}`,
        },
      });
      if (stockMovementsToCreate.length > 0) {
        // Defensa contra stock negativo: el cajero ya pasó por el sold-out gate
        // del POS, pero si la ventana de availability se desactualizó (otra
        // venta consumió primero, o el snapshot offline está stale), bloqueamos
        // acá antes de crear el movement. Lee el stock actual en una sola
        // groupBy y compara contra la suma de deltas negativos por entidad.
        await this.consumption.assertStockSufficient(tx, stockMovementsToCreate);
        await tx.inventoryMovement.createMany({
          data: stockMovementsToCreate,
        });
      }
      return tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: includeFull(),
      });
    });

    await this.audit.log({
      userId,
      action: 'SALE_PAID',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        method: input.method,
        amountReceived: input.amountReceived,
        movementsCreated: stockMovementsToCreate.length,
      },
    });

    const dto = toSaleDto(updated);
    // Notifica al KDS: la venta entra al queue de cocina.
    this.kdsGateway.emit('order.created', dto);
    // Notifica al cliente via WhatsApp que el pago fue verificado (WEB_PICKUP).
    // `silent` (cobro retroactivo offline) lo omite — el cliente ya retiró.
    if (!input.silent) {
      void this.notifications.notify(saleId, 'payment_received');
    }
    return dto;
  }

  // ==================================================================
  // VOID
  // ==================================================================

  /**
   * Anula una venta. Requiere PIN de Admin/Dueño en `approverPin`. Si la
   * sale estaba PAGADO (o estados posteriores), revierte los movements
   * de stock con movements compensatorios (delta opuesto, type=SALE).
   */
  async void(
    saleId: string,
    input: VoidSale,
    cashierId: string,
    approverPin: string,
  ): Promise<Sale> {
    const approverId = await this.approvals.verify(approverPin).catch(async (err) => {
      await this.audit.log({
        userId: cashierId,
        action: 'APPROVAL_DENIED',
        entityType: 'sale',
        entityId: saleId,
        metadata: { reason: 'void', message: err instanceof Error ? err.message : 'invalid pin' },
      });
      throw err instanceof ForbiddenException ? err : new ForbiddenException('PIN inválido');
    });

    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    // Solo se anula un pedido PAGADO que la cocina AÚN NO inició. Una vez en
    // EN_PREPARACION (o posterior) ya hay comida en juego → no se anula. Los web
    // PENDIENTE_PAGO se rechazan con cancelWebOrder (nunca se cobraron).
    if (existing.status !== 'PAGADO') {
      throw new BadRequestException(
        existing.status === 'EN_PREPARACION' || existing.status === 'LISTO_DESPACHO'
          ? 'No se puede anular: la cocina ya inició este pedido.'
          : `No se puede anular en estado ${existing.status}.`,
      );
    }

    const oldStatus = existing.status;
    // El pedido estaba PAGADO → descontó stock al cobrarse. Se revierte con
    // movements compensatorios (insert-only, delta opuesto, type=SALE).
    const reverseMovements: Prisma.InventoryMovementCreateManyInput[] = [];
    {
      const originals = await this.prisma.inventoryMovement.findMany({
        where: { sourceType: 'sale', sourceId: saleId, type: 'SALE' },
      });
      for (const orig of originals) {
        reverseMovements.push({
          entityType: orig.entityType,
          ingredientId: orig.ingredientId,
          productId: orig.productId,
          subproductId: orig.subproductId,
          delta: Number(orig.delta) * -1,
          type: 'SALE',
          sourceType: 'sale',
          sourceId: saleId,
          userId: cashierId,
          notes: `Reverso de void · ${input.reason.slice(0, 100)}`,
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.update({
        where: { id: saleId },
        data: { status: 'VOID', voidReason: input.reason },
        include: includeFull(),
      });
      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: oldStatus,
          statusTo: 'VOID',
          userId: cashierId,
          notes: `void: ${input.reason}`,
        },
      });
      if (reverseMovements.length > 0) {
        await tx.inventoryMovement.createMany({ data: reverseMovements });
      }
      return sale;
    });

    await this.audit.log({
      userId: cashierId,
      action: 'SALE_VOIDED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        reason: input.reason,
        approverId,
        oldStatus,
        movementsReversed: reverseMovements.length,
      },
    });
    await this.audit.log({
      userId: approverId,
      action: 'APPROVAL_GRANTED',
      entityType: 'sale',
      entityId: saleId,
      metadata: { reason: 'void', cashierId },
    });

    const dto = toSaleDto(updated);
    // Antifraude: el dueño se entera de CADA anulación al instante.
    void this.ownerNotifications.alert(
      'sale_voided',
      buildVoidAlertMessage({
        businessName: process.env.BUSINESS_NAME ?? 'Tercos',
        cashierName: dto.cashierName ?? null,
        receiptNumber: dto.receiptNumber,
        turnNumber: dto.turnNumber,
        total: dto.total,
        reason: input.reason,
      }),
      { saleId, receiptNumber: dto.receiptNumber },
    );
    // Estaba PAGADO → en la cola de cocina. Avisar al KDS para sacarlo del board.
    this.kdsGateway.emit('order.status.changed', dto);
    return dto;
  }

  // ==================================================================
  // CANCEL WEB ORDER (pedido web nunca pagado)
  // ==================================================================

  /**
   * El cajero rechaza un pedido web que sigue PENDIENTE_PAGO (cliente nunca
   * pagó). Transiciona a CANCELADO_NO_PAGO (sin reverso de stock: nunca se
   * descontó) y avisa al cliente por WhatsApp. Solo WEB_PICKUP.
   */
  async cancelWebOrder(saleId: string, cashierId: string): Promise<Sale> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { type: true, status: true },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    if (existing.type !== 'WEB_PICKUP') {
      throw new BadRequestException('Solo se pueden rechazar pedidos web.');
    }
    if (existing.status !== 'PENDIENTE_PAGO') {
      throw new BadRequestException(
        `No se puede rechazar: el pedido está en ${existing.status}.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.sale.updateMany({
        where: { id: saleId, status: 'PENDIENTE_PAGO' },
        data: { status: 'CANCELADO_NO_PAGO' },
      });
      if (res.count === 0) {
        throw new BadRequestException('El pedido cambió de estado.');
      }
      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: 'PENDIENTE_PAGO',
          statusTo: 'CANCELADO_NO_PAGO',
          userId: cashierId,
          notes: 'Pedido web rechazado por el cajero',
        },
      });
      return tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: includeFull(),
      });
    });

    await this.audit.log({
      userId: cashierId,
      action: 'SALE_STATUS_CHANGED',
      entityType: 'sale',
      entityId: saleId,
      metadata: { from: 'PENDIENTE_PAGO', to: 'CANCELADO_NO_PAGO', stage: 'web-canceled' },
    });

    // Avisa al cliente que su pedido fue cancelado (fire-and-forget).
    void this.notifications.notify(saleId, 'canceled');
    return toSaleDto(updated);
  }

  // ==================================================================
  // READ
  // ==================================================================

  async list(filter: ListSalesFilter = {}): Promise<Sale[]> {
    const where: Prisma.SaleWhereInput = {};
    if (filter.status) where.status = filter.status as DbSaleStatus;
    if (filter.cashierId) where.cashierId = filter.cashierId;
    if (filter.shiftId) where.shiftId = filter.shiftId;
    if (filter.type) where.type = filter.type as Prisma.SaleWhereInput['type'];
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    const rows = await this.prisma.sale.findMany({
      where,
      include: includeFull(),
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 100,
    });
    return rows.map(toSaleDto);
  }

  async getById(id: string): Promise<Sale> {
    const row = await this.prisma.sale.findUnique({
      where: { id },
      include: includeFull(),
    });
    if (!row) throw new NotFoundException(`Sale ${id} not found`);
    return toSaleDto(row);
  }

  // ==================================================================
  // STATUS LOG
  // ==================================================================

  async getStatusLog(saleId: string): Promise<SaleStatusLogEntry[]> {
    const exists = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Sale ${saleId} not found`);
    const rows = await this.prisma.saleStatusLog.findMany({
      where: { saleId },
      include: { user: { select: { fullName: true } } },
      orderBy: { changedAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      statusFrom: r.statusFrom as SaleStatus | null,
      statusTo: r.statusTo as SaleStatus,
      userId: r.userId,
      userName: r.user?.fullName ?? null,
      notes: r.notes,
      changedAt: r.changedAt.toISOString(),
    }));
  }

}

// =====================================================================
// HELPERS
// =====================================================================

interface ComputedSaleItem {
  productId: string;
  sizeId: string | null;
  quantity: number;
  unitPrice: number;
  modifiers: AppliedModifier[];
  notes: string | null;
  appliedPromotionId: string | null;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
}

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { sizes: true; modifiers: true };
}>;

function computeLine(
  input: CreateSaleItem,
  productMap: Map<string, ProductWithRelations>,
  activePromotions: PromotionDef[],
  at: Date,
): ComputedSaleItem {
  const product = productMap.get(input.productId);
  if (!product) {
    throw new NotFoundException(`Product ${input.productId} not found`);
  }
  if (!product.isActive) {
    throw new BadRequestException(`Product "${product.name}" is inactive`);
  }

  let basePrice = Number(product.basePrice);
  if (product.isCombo && product.comboPrice !== null) {
    basePrice = Number(product.comboPrice);
  }

  // Size
  let sizeId: string | null = null;
  if (input.sizeId) {
    const size = product.sizes.find((s) => s.id === input.sizeId);
    if (!size) {
      throw new BadRequestException(
        `Size ${input.sizeId} no pertenece a product "${product.name}"`,
      );
    }
    sizeId = size.id;
    basePrice += Number(size.priceModifier);
  }

  // Modifiers (snapshot)
  const modifiers: AppliedModifier[] = [];
  if (input.modifiers && input.modifiers.length > 0) {
    if (!product.modifiersEnabled) {
      throw new BadRequestException(
        `Product "${product.name}" no tiene modifiers habilitados`,
      );
    }
    for (const m of input.modifiers) {
      const def = product.modifiers.find((md) => md.id === m.modifierId);
      if (!def) {
        throw new BadRequestException(
          `Modifier ${m.modifierId} no pertenece a product "${product.name}"`,
        );
      }
      modifiers.push({
        modifierId: def.id,
        name: def.name,
        priceDelta: Number(def.priceDelta),
      });
      basePrice += Number(def.priceDelta);
    }
  }

  if (basePrice < 0) {
    throw new BadRequestException(
      `Precio negativo después de modifiers para "${product.name}" (${basePrice})`,
    );
  }

  const unitPrice = roundMoney(basePrice);
  const lineSubtotal = roundMoney(unitPrice * input.quantity);

  // Motor de promociones puro (5.C + 12.A: BOGO/FIXED_OFF/COMBO_OFF).
  // Devuelve appliedPromotionId=null + lineDiscount=0 cuando ninguna matchea.
  const promo = applyPromotion(
    {
      productId: product.id,
      lineSubtotal,
      quantity: input.quantity,
      isCombo: product.isCombo,
      at,
    },
    activePromotions,
  );

  const lineDiscount = roundMoney(promo.lineDiscount);
  const lineTotal = roundMoney(lineSubtotal - lineDiscount);

  return {
    productId: product.id,
    sizeId,
    quantity: input.quantity,
    unitPrice,
    modifiers,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    appliedPromotionId: promo.appliedPromotionId,
    lineSubtotal,
    lineDiscount,
    lineTotal,
  };
}
