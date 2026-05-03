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
  type CashDrawerProvider,
  type DrawerOpenResult,
  type PrinterProvider,
  type PrintResult,
  type PromotionDef,
  type ReceiptData,
} from '@pos-tercos/domain';
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
  VoidSale,
} from '@pos-tercos/types';
import type { Prisma, SaleStatus as DbSaleStatus } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { CASH_DRAWER_PROVIDER } from '../adapters/cash-drawer/cash-drawer.module';
import { PRINTER_PROVIDER } from '../adapters/printer/printer.module';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { KdsGateway } from '../kds/kds.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { PublicDisplayService } from '../public-display/public-display.service';
import { RecipesService } from '../recipes/recipes.service';

const SALES_CREATE_ENDPOINT = 'POST /sales';

type DbSaleWithDetail = Prisma.SaleGetPayload<{
  include: {
    cashier: { select: { fullName: true } };
    paidBy: { select: { fullName: true } };
    repartidor: { select: { fullName: true } };
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
    private readonly publicDisplay: PublicDisplayService,
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

    // COUNTER requiere turno abierto del cajero. WEB_* no exige turno
    // (el cajero asignará shift al confirmar el pago vía POS, fuera de
    // este endpoint).
    let shift: Awaited<ReturnType<typeof this.prisma.shift.findFirst>> = null;
    if (input.type === 'COUNTER') {
      shift = await this.prisma.shift.findFirst({
        where: { cashierId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
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

    // turn_number: para COUNTER cuenta ventas del cajero en el día;
    // para WEB_* cuenta ventas web del día. Se usa solo para display
    // en el recibo, no es identificador único.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.sale.count({
      where:
        input.type === 'COUNTER'
          ? { cashierId, createdAt: { gte: startOfDay } }
          : { type: input.type, createdAt: { gte: startOfDay } },
    });
    const turnNumber = todayCount + 1;

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
          turnNumber,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          customerNit: input.customerNit ?? null,
          deliveryAddress: input.deliveryAddress ?? null,
          deliveryLat: input.deliveryLat ?? null,
          deliveryLng: input.deliveryLng ?? null,
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
    if (input.amountReceived < Number(existing.total) - 0.005) {
      throw new BadRequestException(
        `Amount received (${input.amountReceived}) < total (${Number(existing.total)})`,
      );
    }

    // Cargar productos con flags relevantes para descuento de stock
    const productIds = Array.from(new Set(existing.items.map((it) => it.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, directResale: true, isCombo: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Pre-cargar grafos de receta para productos NO direct-resale (uno por uno
    // para reusar el helper existente; FASE 13 puede optimizar a un load
    // batched). Combos se descomponen vía combo_components — fuera de scope
    // FASE 5.B: si un combo aparece, error explícito.
    const stockMovementsToCreate: Prisma.InventoryMovementCreateManyInput[] = [];

    for (const item of existing.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Sale tiene un item para product ${item.productId} que ya no existe.`,
        );
      }

      if (product.isCombo) {
        throw new BadRequestException(
          `Combos no soportados en FASE 5.B (sale tiene combo "${product.name}"). Llega en 5.E o FASE 13 vía combo_components × expandRecipe por componente.`,
        );
      }

      const qty = item.quantity;

      if (product.directResale) {
        // descuento directo: 1 movement por línea
        stockMovementsToCreate.push({
          entityType: 'PRODUCT',
          productId: product.id,
          delta: -qty,
          type: 'SALE',
          sourceType: 'sale',
          sourceId: saleId,
          userId,
          notes: `Sale ${existing.id.slice(0, 8)} item ${product.name}`,
        });
      } else {
        // expandRecipe → 1 movement por insumo final
        const { graph, root } = await this.recipes.loadGraphForProduct(product.id);
        let expanded;
        try {
          expanded = expandRecipe(graph, root, qty);
        } catch (err) {
          throw new BadRequestException({
            message: `Falla al expandir receta de "${product.name}"`,
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
            notes: `Sale ${existing.id.slice(0, 8)} via "${product.name}"`,
          });
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'PAGADO',
          paymentMethod: input.method as PaymentMethod,
          paidAt: new Date(),
          paidByUserId: userId,
        },
        include: includeFull(),
      });
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
      return sale;
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
    // Notifica a la pantalla pública: si es COUNTER, podría aparecer en "next".
    if (dto.type === 'COUNTER') {
      this.publicDisplay.notify();
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
    if (existing.status === 'VOID') {
      throw new BadRequestException('Sale ya está anulada');
    }
    if (existing.status === 'ENTREGADO') {
      throw new BadRequestException(
        'Sale ya está ENTREGADO; usar DEVUELTO o EN_DISPUTA en su lugar (FASE 7+).',
      );
    }

    const oldStatus = existing.status;
    const wasStockDecremented = oldStatus !== 'PENDIENTE_PAGO' && oldStatus !== 'CANCELADO_NO_PAGO';

    // Revertir movements: el sourceId es la sale → buscar todos los SALE
    // movements con ese sourceId y crear movements compensatorios con
    // delta opuesto. NO se hace UPDATE/DELETE (insert-only).
    const reverseMovements: Prisma.InventoryMovementCreateManyInput[] = [];
    if (wasStockDecremented) {
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
        data: { status: 'VOID' },
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
        sale.status !== 'LISTO_DESPACHO' && sale.status !== 'ENTREGADO' &&
        sale.status !== 'ASIGNADO' && sale.status !== 'EN_RUTA') {
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

  // Motor de promociones puro (5.C). Devuelve appliedPromotionId=null +
  // lineDiscount=0 cuando ninguna matchea producto/día/hora.
  const promo = applyPromotion(
    {
      productId: product.id,
      lineSubtotal,
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
    repartidor: { select: { fullName: true } },
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
    deliveryAddress: row.deliveryAddress,
    deliveryLat: row.deliveryLat !== null ? Number(row.deliveryLat) : null,
    deliveryLng: row.deliveryLng !== null ? Number(row.deliveryLng) : null,
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
    repartidorId: row.repartidorId,
    repartidorName: row.repartidor?.fullName ?? null,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    pickedUpAt: row.pickedUpAt?.toISOString() ?? null,
    departedAt: row.departedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAttempts: row.failedAttempts,
    notes: row.notes,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    items,
  };
}
