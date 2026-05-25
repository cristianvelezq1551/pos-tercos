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
  expandRecipe,
  renderReceiptEscPos,
  type CashDrawerProvider,
  type DrawerOpenResult,
  type PrinterProvider,
  type PrintResult,
  type PromotionDef,
  type ReceiptData,
} from '@pos-tercos/domain';
import { DIGITAL_PAYMENT_METHODS } from '@pos-tercos/types';
import type {
  AppliedModifier,
  ConfirmPayment,
  CreateSale,
  CreateSaleItem,
  PaymentMethod,
  Sale,
  SaleItem,
  SaleStatus,
  SaleStatusLogEntry,
  Shift,
  SyncOfflineSale,
  VoidSale,
} from '@pos-tercos/types';
import type { Prisma, SaleStatus as DbSaleStatus } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { CASH_DRAWER_PROVIDER } from '../adapters/cash-drawer/cash-drawer.module';
import { PRINTER_PROVIDER } from '../adapters/printer/printer.module';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { KdsGateway } from '../kds/kds.gateway';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { RecipesService } from '../recipes/recipes.service';
import { ShiftsService } from '../shifts/shifts.service';

const SALES_CREATE_ENDPOINT = 'POST /sales';

type DbSaleWithDetail = Prisma.SaleGetPayload<{
  include: {
    cashier: { select: { fullName: true } };
    paidBy: { select: { fullName: true } };
    items: {
      include: {
        product: { select: { name: true } };
        size: { select: { name: true } };
        appliedPromotion: { select: { name: true } };
      };
    };
  };
}>;

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
    private readonly recipes: RecipesService,
    private readonly promotions: PromotionsService,
    @Inject(PRINTER_PROVIDER) private readonly printer: PrinterProvider,
    @Inject(CASH_DRAWER_PROVIDER) private readonly drawer: CashDrawerProvider,
    @Inject(forwardRef(() => KdsGateway)) private readonly kdsGateway: KdsGateway,
    private readonly notifications: NotificationService,
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
      if (shift) {
        shiftId = shift.id;
        cashierId = userId;
      }
    }

    // Cargar productos con flags relevantes para descuento de stock
    const productIds = Array.from(new Set(existing.items.map((it) => it.productId)));
    // Cargar productos del sale con sus componentes de combo (1 nivel — no hay
    // combos anidados, enforced al crear). Un combo se descompone en sus
    // componentes y descuenta stock de cada uno (reventa directa o receta).
    const saleProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        directResale: true,
        isCombo: true,
        comboComponents: { select: { productId: true, quantity: true } },
      },
    });
    const saleProductMap = new Map(saleProducts.map((p) => [p.id, p]));

    // Productos que son componentes de los combos presentes — para conocer su
    // flag (reventa) y poder expandir su receta.
    const componentIds = new Set<string>();
    for (const p of saleProducts) {
      if (p.isCombo) for (const c of p.comboComponents) componentIds.add(c.productId);
    }
    const componentProducts = componentIds.size
      ? await this.prisma.product.findMany({
          where: { id: { in: [...componentIds] } },
          select: { id: true, name: true, directResale: true, isCombo: true },
        })
      : [];
    const componentMap = new Map(componentProducts.map((p) => [p.id, p]));

    const stockMovementsToCreate: Prisma.InventoryMovementCreateManyInput[] = [];

    const consume = async (
      p: { id: string; name: string; directResale: boolean },
      qty: number,
      sizeId?: string | null,
    ): Promise<void> => {
      if (p.directResale) {
        stockMovementsToCreate.push({
          entityType: 'PRODUCT',
          productId: p.id,
          delta: -qty,
          type: 'SALE',
          sourceType: 'sale',
          sourceId: saleId,
          userId,
          notes: `Sale ${existing.id.slice(0, 8)} item ${p.name}`,
        });
        return;
      }
      // sizeId → suma la receta de la variante (proteína) a la base.
      const { graph, root } = await this.recipes.loadGraphForProduct(
        p.id,
        sizeId ?? undefined,
      );
      let expanded;
      try {
        expanded = expandRecipe(graph, root, qty);
      } catch (err) {
        throw new BadRequestException({
          message: `Falla al expandir receta de "${p.name}"`,
          cause: err instanceof Error ? err.message : String(err),
        });
      }
      for (const ing of expanded.values()) {
        stockMovementsToCreate.push({
          entityType: 'INGREDIENT',
          ingredientId: ing.ingredientId,
          delta: -ing.totalQuantity,
          type: 'SALE',
          sourceType: 'sale',
          sourceId: saleId,
          userId,
          notes: `Sale ${existing.id.slice(0, 8)} via "${p.name}"`,
        });
      }
    };

    for (const item of existing.items) {
      const product = saleProductMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Sale tiene un item para product ${item.productId} que ya no existe.`,
        );
      }

      if (product.isCombo) {
        for (const comp of product.comboComponents) {
          const cp = componentMap.get(comp.productId);
          if (!cp) {
            throw new BadRequestException(
              `Combo "${product.name}" referencia un producto inexistente (${comp.productId}).`,
            );
          }
          if (cp.isCombo) {
            throw new BadRequestException(
              `Combo anidado no soportado en "${product.name}".`,
            );
          }
          await consume(cp, item.quantity * comp.quantity);
        }
      } else {
        await consume(product, item.quantity, item.sizeId);
      }
    }

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
  // SYNC OFFLINE (Fase B.3)
  // ==================================================================

  /**
   * Registra una venta cobrada OFFLINE (COUNTER) que el POS sincroniza al
   * recuperar conexión. La graba TAL CUAL se cobró:
   *  - Totales VERBATIM (no recomputa promos ni valida soldOut → "gana lo
   *    cobrado offline"; cualquier diferencia se ve en el stock/auditoría).
   *  - `paidAt = soldOfflineAt` (backdateado → el revenue cae en la hora real).
   *  - Status ENTREGADO: la venta ya fue entrega directa offline (NO entra al
   *    KDS ni al turnero, ni dispara notificaciones).
   *  - Idempotente por `localId` (= idempotency key) → cero doble-cobro.
   */
  async syncOffline(input: SyncOfflineSale, userId: string): Promise<Sale> {
    const dup = await this.prisma.sale.findUnique({
      where: { idempotencyKey: input.localId },
      include: includeFull(),
    });
    if (dup) {
      await this.audit.log({
        userId,
        action: 'IDEMPOTENCY_HIT',
        entityType: 'sale',
        entityId: dup.id,
        metadata: { endpoint: 'POST /sales/sync-offline', key: input.localId },
      });
      return toSaleDto(dup);
    }

    // Caja del día abierta (la que estaba abierta antes del corte). Si quedó una
    // de un día previo, getActiveTodayShift lanza Conflict → falla → el cajero
    // cierra la caja vieja y reintenta (bandeja de revisión, B.5).
    const shift = await this.shifts.getActiveTodayShift(userId);
    if (!shift) {
      throw new BadRequestException(
        'No hay caja abierta para asociar la venta offline. Abrí/cerrá caja y reintentá.',
      );
    }

    // Validar productos + computar consumo ANTES de la tx: un fallo acá manda la
    // venta a la bandeja de revisión sin quemar número de recibo.
    const specs = await this.computeOfflineConsumption(input.payload.lines);

    const updated = await this.prisma.$transaction(async (tx) => {
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT nextval('receipt_seq') AS next
      `;
      const receiptNumber = next;
      // Turno: secuencia por caja (igual que confirmPayment).
      const assigned = await tx.sale.count({
        where: { shiftId: shift.id, turnNumber: { not: null } },
      });
      const turnNumber = assigned + 1;

      const sale = await tx.sale.create({
        data: {
          receiptNumber,
          type: 'COUNTER',
          status: 'ENTREGADO',
          turnNumber,
          customerName: input.payload.customerName,
          subtotal: input.payload.subtotal,
          discountTotal: input.payload.discount,
          total: input.payload.total,
          paymentMethod: input.payment.method as PaymentMethod,
          paidAt: new Date(input.soldOfflineAt),
          paidByUserId: userId,
          cashierId: userId,
          shiftId: shift.id,
          idempotencyKey: input.localId,
          items: {
            create: input.payload.lines.map((l) => ({
              productId: l.productId,
              sizeId: l.sizeId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              modifiersJson: l.modifiers as unknown as Prisma.InputJsonValue,
              notes: l.notes ?? null,
              appliedPromotionId: l.appliedPromotionId,
              lineSubtotal: l.lineSubtotal,
              lineDiscount: l.lineDiscount,
              lineTotal: l.lineTotal,
            })),
          },
          statusLog: {
            create: {
              statusFrom: null,
              statusTo: 'ENTREGADO',
              userId,
              notes: `Venta offline ${input.provisionalNumber} sincronizada`,
            },
          },
        },
        select: { id: true },
      });

      if (specs.length > 0) {
        await tx.inventoryMovement.createMany({
          data: specs.map((s) => ({
            entityType: s.entityType,
            ingredientId: s.ingredientId ?? null,
            productId: s.productId ?? null,
            delta: s.delta,
            type: 'SALE' as const,
            sourceType: 'sale',
            sourceId: sale.id,
            userId,
            notes: s.note,
          })),
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: includeFull(),
      });
    });

    const dto = toSaleDto(updated);
    await this.audit.log({
      userId,
      action: 'SALE_SYNCED_OFFLINE',
      entityType: 'sale',
      entityId: dto.id,
      metadata: {
        provisionalNumber: input.provisionalNumber,
        receiptNumber: dto.receiptNumber,
        turnNumber: dto.turnNumber,
        method: input.payment.method,
        offlineVerified: input.payment.offlineVerified,
        soldOfflineAt: input.soldOfflineAt,
        movementsCreated: specs.length,
      },
    });
    // Sin KDS ni notificaciones: la venta offline ya se entregó (entrega directa).
    return dto;
  }

  /**
   * Consumo de stock de una venta offline. Mismo criterio que confirmPayment
   * (reventa directa / receta vía expandRecipe / combos por componentes) pero
   * devuelve SPECS sin saleId (se inyecta al crear la venta en la tx).
   */
  private async computeOfflineConsumption(
    lines: ReadonlyArray<{ productId: string; quantity: number; sizeId: string | null }>,
  ): Promise<
    Array<{
      entityType: 'PRODUCT' | 'INGREDIENT';
      ingredientId?: string;
      productId?: string;
      delta: number;
      note: string;
    }>
  > {
    const specs: Array<{
      entityType: 'PRODUCT' | 'INGREDIENT';
      ingredientId?: string;
      productId?: string;
      delta: number;
      note: string;
    }> = [];

    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    const saleProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        directResale: true,
        isCombo: true,
        comboComponents: { select: { productId: true, quantity: true } },
      },
    });
    const saleProductMap = new Map(saleProducts.map((p) => [p.id, p]));

    const componentIds = new Set<string>();
    for (const p of saleProducts) {
      if (p.isCombo) for (const c of p.comboComponents) componentIds.add(c.productId);
    }
    const componentProducts = componentIds.size
      ? await this.prisma.product.findMany({
          where: { id: { in: [...componentIds] } },
          select: { id: true, name: true, directResale: true, isCombo: true },
        })
      : [];
    const componentMap = new Map(componentProducts.map((p) => [p.id, p]));

    const consume = async (
      p: { id: string; name: string; directResale: boolean },
      qty: number,
      sizeId?: string | null,
    ): Promise<void> => {
      if (p.directResale) {
        specs.push({
          entityType: 'PRODUCT',
          productId: p.id,
          delta: -qty,
          note: `Offline venta item ${p.name}`,
        });
        return;
      }
      const { graph, root } = await this.recipes.loadGraphForProduct(
        p.id,
        sizeId ?? undefined,
      );
      let expanded;
      try {
        expanded = expandRecipe(graph, root, qty);
      } catch (err) {
        throw new BadRequestException({
          message: `Falla al expandir receta de "${p.name}" (venta offline)`,
          cause: err instanceof Error ? err.message : String(err),
        });
      }
      for (const ing of expanded.values()) {
        specs.push({
          entityType: 'INGREDIENT',
          ingredientId: ing.ingredientId,
          delta: -ing.totalQuantity,
          note: `Offline via "${p.name}"`,
        });
      }
    };

    for (const line of lines) {
      const product = saleProductMap.get(line.productId);
      if (!product) {
        throw new BadRequestException(
          `Producto ${line.productId} ya no existe (venta offline).`,
        );
      }
      if (product.isCombo) {
        for (const comp of product.comboComponents) {
          const cp = componentMap.get(comp.productId);
          if (!cp) {
            throw new BadRequestException(
              `Combo "${product.name}" referencia un producto inexistente.`,
            );
          }
          if (cp.isCombo) {
            throw new BadRequestException(
              `Combo anidado no soportado en "${product.name}".`,
            );
          }
          await consume(cp, line.quantity * comp.quantity);
        }
      } else {
        await consume(product, line.quantity, line.sizeId);
      }
    }

    return specs;
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
  // PRINT RECEIPT
  // ==================================================================

  /**
   * Devuelve el recibo renderizado a bytes ESC/POS (base64) para que el
   * NAVEGADOR del mostrador lo mande al print-agent LOCAL (impresión sin que
   * el backend tenga que alcanzar la impresora). Audita igual que printReceipt.
   */
  async getReceiptEscPos(
    saleId: string,
    userId: string,
  ): Promise<{ escposBase64: string; receiptNumber: number; reprint: boolean }> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: includeFull(),
    });
    if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
    if (
      sale.status !== 'PAGADO' &&
      sale.status !== 'EN_PREPARACION' &&
      sale.status !== 'LISTO_DESPACHO' &&
      sale.status !== 'ENTREGADO'
    ) {
      throw new BadRequestException(
        `Sale en status ${sale.status} no se puede imprimir (solo desde PAGADO en adelante).`,
      );
    }

    const previousPrints = await this.prisma.auditLog.count({
      where: {
        action: { in: ['RECEIPT_PRINTED', 'RECEIPT_REPRINTED'] },
        entityType: 'sale',
        entityId: saleId,
      },
    });
    const isReprint = previousPrints > 0;
    const receipt = buildReceiptData(toSaleDto(sale), isReprint);
    const bytes = renderReceiptEscPos(receipt);

    await this.audit.log({
      userId,
      action: isReprint ? 'RECEIPT_REPRINTED' : 'RECEIPT_PRINTED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        receiptNumber: Number(sale.receiptNumber),
        via: 'browser-agent',
        previousPrintCount: previousPrints,
      },
    });

    return {
      escposBase64: bytes.toString('base64'),
      receiptNumber: Number(sale.receiptNumber),
      reprint: isReprint,
    };
  }

  /**
   * Imprime/reimprime el recibo de la sale. La 1ra vez audita
   * RECEIPT_PRINTED; las siguientes audit RECEIPT_REPRINTED y el HTML
   * generado lleva banner "DUPLICADO" + sufijo en filename para
   * mantener histórico (no pisa el original).
   *
   * Solo para sales status=PAGADO (no tiene sentido imprimir un
   * draft o un VOID).
   */
  async printReceipt(saleId: string, userId: string): Promise<PrintResult> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: includeFull(),
    });
    if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
    if (sale.status !== 'PAGADO' && sale.status !== 'EN_PREPARACION' &&
        sale.status !== 'LISTO_DESPACHO' && sale.status !== 'ENTREGADO') {
      throw new BadRequestException(
        `Sale en status ${sale.status} no se puede imprimir (solo desde PAGADO en adelante).`,
      );
    }

    // Detectar reimpresión: si ya hay audit RECEIPT_PRINTED para esta sale,
    // marcar como reprint.
    const previousPrints = await this.prisma.auditLog.count({
      where: {
        action: { in: ['RECEIPT_PRINTED', 'RECEIPT_REPRINTED'] },
        entityType: 'sale',
        entityId: saleId,
      },
    });
    const isReprint = previousPrints > 0;

    const receipt = buildReceiptData(toSaleDto(sale), isReprint);
    const result = await this.printer.print(receipt);

    await this.audit.log({
      userId,
      action: isReprint ? 'RECEIPT_REPRINTED' : 'RECEIPT_PRINTED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        receiptNumber: Number(sale.receiptNumber),
        printerKey: result.key,
        previousPrintCount: previousPrints,
      },
    });

    return result;
  }

  // ==================================================================
  // OPEN DRAWER
  // ==================================================================

  /**
   * Abre el cajón monedero. Dos modos:
   *  - Con sale (saleId presente): apertura normal post-pago. Sin PIN.
   *  - Sin sale ("no-sale"): requiere reason + X-Approval-Pin (cajero NO
   *    puede abrir cajón sin venta sin aprobación, pos-spec.v1.md:58).
   *
   * En FASE 5.D el adapter es mock (solo loggea + audit). En FASE 15 el
   * Print Agent local manda el comando ESC/POS al cajón físico.
   */
  async openDrawer(input: {
    saleId: string | null;
    reason: string | null;
    cashierId: string;
    approverPin?: string;
  }): Promise<DrawerOpenResult> {
    const isNoSale = input.saleId === null;

    if (isNoSale) {
      if (!input.reason || input.reason.trim().length < 5) {
        throw new BadRequestException(
          'Apertura sin venta requiere reason (mínimo 5 caracteres).',
        );
      }
      if (!input.approverPin) {
        throw new ForbiddenException(
          'Apertura sin venta requiere X-Approval-Pin de Admin/Dueño.',
        );
      }
      const approverId = await this.approvals.verify(input.approverPin).catch(
        async (err) => {
          await this.audit.log({
            userId: input.cashierId,
            action: 'APPROVAL_DENIED',
            entityType: 'cash_drawer',
            metadata: {
              reason: 'open-no-sale',
              given: input.reason,
              message: err instanceof Error ? err.message : 'invalid pin',
            },
          });
          throw err instanceof ForbiddenException
            ? err
            : new ForbiddenException('PIN inválido');
        },
      );

      const result = await this.drawer.open({ reason: input.reason });

      await this.audit.log({
        userId: input.cashierId,
        action: 'CASH_DRAWER_OPENED_NO_SALE',
        entityType: 'cash_drawer',
        metadata: { reason: input.reason, approverId },
      });
      await this.audit.log({
        userId: approverId,
        action: 'APPROVAL_GRANTED',
        entityType: 'cash_drawer',
        metadata: { context: 'open-no-sale', cashierId: input.cashierId },
      });

      return result;
    }

    // Apertura normal: validar que la sale exista + esté pagada
    const sale = await this.prisma.sale.findUnique({
      where: { id: input.saleId! },
      select: { id: true, status: true, receiptNumber: true },
    });
    if (!sale) throw new NotFoundException(`Sale ${input.saleId} not found`);
    if (sale.status !== 'PAGADO') {
      throw new BadRequestException(
        `Sale en status ${sale.status} no permite apertura de cajón (solo PAGADO).`,
      );
    }

    const result = await this.drawer.open({ reason: null });

    await this.audit.log({
      userId: input.cashierId,
      action: 'CASH_DRAWER_OPENED',
      entityType: 'sale',
      entityId: sale.id,
      metadata: { receiptNumber: Number(sale.receiptNumber) },
    });

    return result;
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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function includeFull() {
  return {
    cashier: { select: { fullName: true } },
    paidBy: { select: { fullName: true } },
    items: {
      include: {
        product: { select: { name: true } },
        size: { select: { name: true } },
        appliedPromotion: { select: { name: true } },
      },
    },
  } satisfies Prisma.SaleInclude;
}

/**
 * Convierte un Sale DTO + flag de reimpresión al formato `ReceiptData`
 * que consume el renderer puro. Branding del negocio viene de env vars
 * con fallbacks razonables para dev.
 */
function buildReceiptData(sale: Sale, isReprint: boolean): ReceiptData {
  return {
    receiptNumber: sale.receiptNumber,
    turnNumber: sale.turnNumber,
    createdAt: sale.createdAt,
    cashierName: sale.cashierName ?? null,
    customerName: sale.customerName,
    items: (sale.items ?? []).map((it) => ({
      productName: it.productName ?? '(sin nombre)',
      sizeName: it.sizeName ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineSubtotal: it.lineSubtotal,
      lineDiscount: it.lineDiscount,
      lineTotal: it.lineTotal,
      appliedPromotionName: it.appliedPromotionName ?? null,
      modifiers: (it.modifiers ?? []).map((m) => ({
        name: m.name,
        priceDelta: m.priceDelta,
      })),
    })),
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    total: sale.total,
    reprintLabel: isReprint ? 'DUPLICADO' : null,
    // En efectivo el print abre el cajón (RJ-11). En transferencia no hace falta.
    openDrawer: sale.paymentMethod === 'CASH',
    business: {
      name: process.env.BUSINESS_NAME ?? 'POS Tercos',
      address: process.env.BUSINESS_ADDRESS ?? 'Dirección por configurar',
      nit: process.env.BUSINESS_NIT ?? '900.000.000-0',
      phone: process.env.BUSINESS_PHONE ?? null,
    },
  };
}

function toSaleDto(row: DbSaleWithDetail): Sale {
  const items: SaleItem[] = row.items.map((it) => ({
    id: it.id,
    saleId: it.saleId,
    productId: it.productId,
    productName: it.product?.name ?? undefined,
    sizeId: it.sizeId,
    sizeName: it.size?.name ?? null,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    modifiers: (it.modifiersJson as unknown as AppliedModifier[]) ?? [],
    notes: it.notes ?? null,
    appliedPromotionId: it.appliedPromotionId,
    appliedPromotionName: it.appliedPromotion?.name ?? null,
    lineSubtotal: Number(it.lineSubtotal),
    lineDiscount: Number(it.lineDiscount),
    lineTotal: Number(it.lineTotal),
  }));
  return {
    id: row.id,
    receiptNumber: Number(row.receiptNumber),
    type: row.type,
    status: row.status,
    turnNumber: row.turnNumber,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerNit: row.customerNit,
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discountTotal),
    total: Number(row.total),
    paymentMethod: row.paymentMethod,
    paidAt: row.paidAt?.toISOString() ?? null,
    paidByUserId: row.paidByUserId,
    paidByName: row.paidBy?.fullName ?? null,
    cashierId: row.cashierId,
    cashierName: row.cashier?.fullName ?? null,
    shiftId: row.shiftId,
    notes: row.notes,
    voidReason: row.voidReason,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    items,
  };
}
