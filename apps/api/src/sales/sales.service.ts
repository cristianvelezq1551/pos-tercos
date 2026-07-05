import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyPromotion,
  buildManualDiscountAlertMessage,
  buildVoidAlertMessage,
  manualDiscountAmount,
  roundMoney,
  roundsToZeroAt4,
  type PromotionDef,
} from '@pos-tercos/domain';
import { DIGITAL_PAYMENT_METHODS, REFUND_VOID_REASON_PREFIX } from '@pos-tercos/types';
import type {
  AppliedModifier,
  ConfirmPayment,
  SalePaymentInput,
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
import { NotificationService } from '../notifications/notification.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { ShiftsService } from '../shifts/shifts.service';
import { SalesConsumptionService } from './sales-consumption.service';
import { includeFull, toSaleDto } from './sales.mappers';

const SALES_CREATE_ENDPOINT = 'POST /sales';
// Cota alta: cada ronda de colisión deja pasar al menos un cobro (gana el índice
// único / la serialización), así que basta con ≥ ráfaga concurrente esperable.
// En la realidad (1 cajero) las colisiones son 0-1; esto cubre ráfagas grandes
// sin un 500.
const MAX_SALE_TX_RETRIES = 16;

/**
 * Transacción de venta (cobro/edición/sync): isolation SERIALIZABLE para que el
 * chequeo de stock (`assertStockSufficient`) y el descuento sean atómicos contra
 * cualquier otra venta/producción concurrente — Postgres aborta con 40001 antes
 * de dejar stock negativo. El timeout cubre el trabajo extra del cobro.
 */
export const SALE_TX_OPTS = {
  isolationLevel: 'Serializable',
  timeout: 15_000,
} as const;

/** Postgres SQLSTATE 40001 (serialization_failure) → Prisma lo expone como P2034. */
export function isSerializationFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: string }).code;
  return code === 'P2034' || /could not serialize|deadlock detected/i.test(e.message);
}

/**
 * P2002 sobre sales.idempotency_key: dos POST /sales concurrentes con la misma
 * key, o un reintento tras crash entre el commit y el cache de idempotencia.
 * El caller lo resuelve devolviendo la venta ya creada (fix B3 auditoría).
 */
export function isIdempotencyKeyConflict(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  return Array.isArray(target)
    ? target.some((t) => String(t).includes('idempotency_key'))
    : String(target ?? '').includes('idempotency_key');
}

/**
 * Reintenta una transacción de venta cuando aborta por un fallo de
 * serialización Serializable (otra venta/producción tocó el mismo stock). La tx
 * hace rollback COMPLETO, así que reintentar es seguro: el guard de status
 * (`updateMany WHERE PENDIENTE_PAGO`) impide doble-cobro, y el stock se
 * recomputa fresco en el reintento.
 */
export async function runSaleTxWithRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (e) {
      if (attempt < MAX_SALE_TX_RETRIES && isSerializationFailure(e)) {
        continue;
      }
      throw e;
    }
  }
}

/** Movement original de una venta (los campos que el reverso necesita leer). */
type SaleMovement = {
  entityType: Prisma.InventoryMovementCreateManyInput['entityType'];
  ingredientId: string | null;
  productId: string | null;
  subproductId: string | null;
  delta: Prisma.Decimal | number;
};

/**
 * Reverso de una venta anulada/reembolsada: emite UN movement compensatorio por
 * stockable = NETO consumido (suma de TODOS los movements SALE: cobro + ajustes
 * de edición), con delta opuesto. Un reverso por movement descoordinaría el FIFO
 * (devuelve `delta` unidades por reverso); el neto lo resuelve de una. Descarta
 * netos que redondean a 0 (consumido y ya devuelto por una edición), que
 * violarían el CHECK `delta <> 0`.
 */
export function buildNetReverseMovements(
  originals: SaleMovement[],
  opts: { saleId: string; userId: string; notes: string },
): Prisma.InventoryMovementCreateManyInput[] {
  const netByStockable = new Map<string, Prisma.InventoryMovementCreateManyInput>();
  for (const orig of originals) {
    const k = `${orig.entityType}:${orig.ingredientId ?? ''}:${orig.productId ?? ''}:${orig.subproductId ?? ''}`;
    const cur = netByStockable.get(k);
    if (cur) {
      cur.delta = Number(cur.delta) - Number(orig.delta);
    } else {
      netByStockable.set(k, {
        entityType: orig.entityType,
        ingredientId: orig.ingredientId,
        productId: orig.productId,
        subproductId: orig.subproductId,
        delta: -Number(orig.delta),
        type: 'SALE',
        sourceType: 'sale',
        sourceId: opts.saleId,
        userId: opts.userId,
        notes: opts.notes,
      });
    }
  }
  return [...netByStockable.values()].filter((m) => !roundsToZeroAt4(Number(m.delta)));
}

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
    private readonly notifications: NotificationService,
    private readonly ownerNotifications: OwnerNotificationService,
    private readonly paymentMethods: PaymentMethodsService,
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
   * Promociones: aplica el motor puro de @pos-tercos/domain por línea
   * (computeLine → applyPromotion) con las promos activas al momento.
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

    // Descuento manual (#5b): EXCLUYENTE con promociones. Cualquier descuento
    // manual (línea o total) desactiva el motor de promos para toda la venta.
    const hasManualDiscount =
      input.orderDiscount !== undefined ||
      input.items.some((it) => it.manualDiscount !== undefined);

    // Cargar productos + sizes + modifiers + promociones activas en paralelo
    const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
    const now = new Date();
    const [products, activePromotions] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { sizes: true, modifiers: true },
      }),
      hasManualDiscount ? Promise.resolve([]) : this.promotions.loadActiveAt(now),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validar + computar líneas (motor de promos puro, o descuento manual)
    const computedItems: ComputedSaleItem[] = input.items.map((it) =>
      computeLine(it, productMap, activePromotions, now),
    );

    const subtotal = roundMoney(
      computedItems.reduce((acc, it) => acc + it.lineSubtotal, 0),
    );
    const lineDiscountTotal = roundMoney(
      computedItems.reduce((acc, it) => acc + it.lineDiscount, 0),
    );
    // Descuento sobre el TOTAL: se aplica sobre lo que queda después de los
    // descuentos de línea (nunca deja el total en negativo).
    const orderDiscountAmount = input.orderDiscount
      ? manualDiscountAmount(roundMoney(subtotal - lineDiscountTotal), input.orderDiscount)
      : 0;
    const discountTotal = roundMoney(lineDiscountTotal + orderDiscountAmount);
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

    let newSaleId: string;
    try {
      newSaleId = await this.prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            receiptNumber,
            type: input.type,
            status: 'PENDIENTE_PAGO',
            // Defensa en profundidad además del Zod: cuenta abierta SOLO COUNTER.
            isOpenTab: input.openTab === true && input.type === 'COUNTER',
            customerName: input.customerName ?? null,
            customerPhone: input.customerPhone ?? null,
            customerNit: input.customerNit ?? null,
            subtotal,
            discountTotal,
            total,
            orderDiscountKind: input.orderDiscount?.kind ?? null,
            orderDiscountValue: input.orderDiscount?.value ?? null,
            orderDiscountAmount,
            discountReason: hasManualDiscount ? (input.discountReason ?? null) : null,
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
                manualDiscountKind: c.manualDiscountKind,
                manualDiscountValue: c.manualDiscountValue,
              })),
            },
            statusLog: {
              create: {
                statusFrom: null,
                statusTo: 'PENDIENTE_PAGO',
                userId: cashierId,
                notes: input.openTab ? 'Cuenta abierta creada' : 'Venta creada',
              },
            },
          },
          select: { id: true },
        });
        return sale.id;
      });
    } catch (e) {
      // B3: race de dos creates con la misma key (o crash entre commit y cache
      // de idempotencia) → NO es un 500: la venta ya existe, se devuelve esa.
      if (idempotencyKey && isIdempotencyKeyConflict(e)) {
        const winner = await this.prisma.sale.findUnique({
          where: { idempotencyKey },
          include: includeFull(),
        });
        if (winner) {
          await this.audit.log({
            userId: cashierId,
            action: 'IDEMPOTENCY_HIT',
            entityType: 'sale',
            entityId: winner.id,
            metadata: {
              endpoint: SALES_CREATE_ENDPOINT,
              key: idempotencyKey,
              via: 'unique-constraint',
            },
          });
          return toSaleDto(winner);
        }
      }
      throw e;
    }

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
        openTab: dto.isOpenTab || undefined,
      },
    });

    if (hasManualDiscount) {
      // #5b: sin aprobación, pero el dueño se entera de CADA descuento manual.
      await this.audit.log({
        userId: cashierId,
        action: 'SALE_MANUAL_DISCOUNT',
        entityType: 'sale',
        entityId: dto.id,
        metadata: {
          receiptNumber: dto.receiptNumber,
          subtotal: dto.subtotal,
          discountTotal: dto.discountTotal,
          total: dto.total,
          orderDiscount: input.orderDiscount ?? null,
          lineDiscounts: computedItems
            .filter((c) => c.manualDiscountKind !== null)
            .map((c) => ({
              productId: c.productId,
              kind: c.manualDiscountKind,
              value: c.manualDiscountValue,
              amount: c.lineDiscount,
            })),
          reason: input.discountReason ?? null,
        },
      });
      void this.ownerNotifications.alert(
        'manual_discount',
        buildManualDiscountAlertMessage({
          businessName: process.env.BUSINESS_NAME ?? 'Tercos',
          cashierName: dto.cashierName ?? null,
          receiptNumber: dto.receiptNumber,
          customerName: dto.customerName,
          subtotal: dto.subtotal,
          discountTotal: dto.discountTotal,
          total: dto.total,
          reason: input.discountReason ?? '(sin motivo)',
        }),
        { saleId: dto.id, receiptNumber: dto.receiptNumber },
      );
    }

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
    // Normalizar: el pago simple es una cuenta de UNA parte; la dividida trae
    // 2..N. Validación y persistencia idénticas para ambos modos.
    const parts: SalePaymentInput[] = input.payments ?? [
      {
        method: input.method!,
        amount: total,
        amountReceived: input.amountReceived,
        digitalVerified: input.digitalDoubleVerified,
      },
    ];
    await this.assertPaymentParts(parts, total);
    const summaryMethod: PaymentMethod | null =
      parts.length === 1 ? (parts[0]!.method as PaymentMethod) : null;

    const { shiftId, cashierId } = await this.resolvePaymentShift(
      existing.type,
      existing.shiftId,
      existing.cashierId,
      userId,
    );

    let movementsCreated = 0;
    const updated = await runSaleTxWithRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          // B1 (auditoría): la verdad final de items/total se lee DENTRO de la
          // tx SERIALIZABLE. Si un editItems corrió entre la lectura de arriba
          // y acá, el stock y los pagos se calculan sobre la venta FRESCA (o la
          // suma de partes deja de cuadrar y se aborta con 400).
          const fresh = await tx.sale.findUnique({
            where: { id: saleId },
            include: { items: true },
          });
          if (!fresh || fresh.status !== 'PENDIENTE_PAGO') {
            throw new BadRequestException('La venta ya fue cobrada o cambió de estado.');
          }
          const freshTotal = Number(fresh.total);
          const partsSum = parts.reduce((acc, p) => acc + p.amount, 0);
          if (Math.abs(partsSum - freshTotal) > 0.005) {
            throw new BadRequestException(
              `El pedido cambió mientras se cobraba: el total ahora es ${freshTotal}. Recargá y volvé a cobrar.`,
            );
          }
          // B4 (auditoría): la caja destino debe seguir ABIERTA — si cerró entre
          // la resolución y acá, el efectivo quedaría fuera de todo arqueo.
          if (shiftId) {
            const shift = await tx.shift.findUnique({
              where: { id: shiftId },
              select: { status: true },
            });
            if (!shift || shift.status !== 'OPEN') {
              throw new BadRequestException(
                'La caja se cerró mientras se cobraba. Abrí caja e intentá de nuevo.',
              );
            }
          }
          const stockMovementsToCreate = await this.buildSaleStockMovements(
            fresh.items,
            saleId,
            fresh.id,
            userId,
          );
          movementsCreated = stockMovementsToCreate.length;
          return this.applyConfirmPaymentTx(tx, {
            saleId,
            summaryMethod,
            parts,
            shiftId,
            cashierId,
            userId,
            notes: input.notes,
            stockMovementsToCreate,
          });
        },
        SALE_TX_OPTS,
      ),
    );

    await this.audit.log({
      userId,
      action: 'SALE_PAID',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        method: summaryMethod ?? 'SPLIT',
        parts: parts.length,
        amountReceived: input.amountReceived ?? null,
        movementsCreated,
      },
    });

    const dto = toSaleDto(updated);
    // Notifica al cliente via WhatsApp que el pago fue verificado (WEB_PICKUP).
    // `silent` (cobro retroactivo offline) lo omite — el cliente ya retiró.
    if (!input.silent) {
      void this.notifications.notify(saleId, 'payment_received');
    }
    return dto;
  }

  /**
   * Resuelve el turno/cajero de la venta al cobrar.
   *  - WEB_PICKUP entra sin turno; al confirmar, el cajero le asocia SU caja
   *    abierta (si no, la venta nunca entraría al cierre de caja / Z-report).
   *  - COUNTER ya trae la caja del create — pero una CUENTA ABIERTA puede
   *    cruzar cajas (se cobra días después): si la caja original ya cerró, la
   *    venta se cuelga de la caja abierta del que cobra (la plata entra AHÍ).
   */
  private async resolvePaymentShift(
    type: string,
    currentShiftId: string | null,
    currentCashierId: string | null,
    userId: string,
  ): Promise<{ shiftId: string | null; cashierId: string | null }> {
    if (currentShiftId !== null) {
      const current = await this.prisma.shift.findUnique({
        where: { id: currentShiftId },
        select: { status: true },
      });
      if (current?.status === 'OPEN') {
        return { shiftId: currentShiftId, cashierId: currentCashierId };
      }
    }
    // getActiveTodayShift lanza Conflict si la caja quedó abierta de ayer →
    // el cajero debe cerrarla antes de confirmar pagos.
    const shift = await this.shifts.getActiveTodayShift(userId);
    if (!shift) {
      throw new BadRequestException(
        type === 'WEB_PICKUP'
          ? 'Abrí la caja antes de confirmar pagos web (la venta debe entrar al cierre de caja).'
          : 'La caja de esta venta ya cerró y no hay caja abierta. Abrí caja antes de cobrar.',
      );
    }
    // El cajero original se conserva si existía (atribución de la venta); la
    // caja pasa a ser la del cobro para que el arqueo cuadre.
    return { shiftId: shift.id, cashierId: currentCashierId ?? userId };
  }

  /**
   * Construye los movements SALE de la venta (consumo de stock). Lógica ÚNICA
   * compartida con syncOffline: reventa directa / receta un nivel / combos por
   * componentes (vía SalesConsumptionService).
   */
  private async buildSaleStockMovements(
    items: { productId: string; quantity: number; sizeId: string | null; modifiersJson: Prisma.JsonValue }[],
    saleId: string,
    saleShortRef: string,
    userId: string,
  ): Promise<Prisma.InventoryMovementCreateManyInput[]> {
    const consumptionSpecs = await this.consumption.computeConsumptionSpecs(
      items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        sizeId: it.sizeId,
        modifiers: ((it.modifiersJson as unknown as AppliedModifier[]) ?? []).map((m) => ({
          modifierId: m.modifierId,
        })),
      })),
      `Sale ${saleShortRef.slice(0, 8)}`,
    );
    return consumptionSpecs.map((s) => ({
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
  }

  /**
   * Transacción del cobro: guard de doble-cobro condicionado por status
   * (count===0 → aborta sin descontar stock dos veces), status log, pagos en
   * sale_payments (fuente de verdad del método) y movements de stock con
   * defensa contra stock negativo. Bajo SALE_TX_OPTS (SERIALIZABLE).
   */
  private async applyConfirmPaymentTx(
    tx: Prisma.TransactionClient,
    args: {
      saleId: string;
      summaryMethod: PaymentMethod | null;
      parts: SalePaymentInput[];
      shiftId: string | null;
      cashierId: string | null;
      userId: string;
      notes: string | undefined;
      stockMovementsToCreate: Prisma.InventoryMovementCreateManyInput[];
    },
  ): Promise<Prisma.SaleGetPayload<{ include: ReturnType<typeof includeFull> }>> {
    const { saleId, summaryMethod, parts, shiftId, cashierId, userId, notes, stockMovementsToCreate } =
      args;
    const res = await tx.sale.updateMany({
      where: { id: saleId, status: 'PENDIENTE_PAGO' },
      data: {
        status: 'PAGADO',
        paymentMethod: summaryMethod,
        paidAt: new Date(),
        paidByUserId: userId,
        shiftId,
        cashierId,
      },
    });
    if (res.count === 0) {
      throw new BadRequestException('La venta ya fue cobrada o cambió de estado.');
    }
    await tx.saleStatusLog.create({
      data: {
        saleId,
        statusFrom: 'PENDIENTE_PAGO',
        statusTo: 'PAGADO',
        userId,
        notes:
          notes ??
          (summaryMethod ? `Cobro ${summaryMethod}` : `Cobro dividido (${parts.length} pagos)`),
      },
    });
    await tx.salePayment.createMany({
      data: parts.map((p) => ({
        saleId,
        method: p.method as PaymentMethod,
        amount: p.amount,
        // El vuelto solo existe en efectivo; default = exacto.
        amountReceived: p.method === 'CASH' ? (p.amountReceived ?? p.amount) : null,
      })),
    });
    if (stockMovementsToCreate.length > 0) {
      // Defensa contra stock negativo: el cajero ya pasó por el sold-out gate del
      // POS, pero si la ventana de availability se desactualizó, bloqueamos acá
      // antes de crear el movement.
      await this.consumption.assertStockSufficient(tx, stockMovementsToCreate);
      await tx.inventoryMovement.createMany({ data: stockMovementsToCreate });
    }
    return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: includeFull() });
  }

  /**
   * Pedido WEB pagado → LISTO_DESPACHO: el cajero marca "listo para retirar" y se
   * dispara el WhatsApp al cliente (sin cocina/KDS).
   * Solo WEB_PICKUP en PAGADO; LISTO_DESPACHO es el estado final del pedido web.
   */
  async markWebReady(saleId: string, userId: string): Promise<Sale> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { type: true, status: true },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    if (existing.type !== 'WEB_PICKUP') {
      throw new BadRequestException('Solo los pedidos web se marcan listos para retirar.');
    }
    if (existing.status !== 'PAGADO') {
      throw new BadRequestException(`No se puede marcar listo en estado ${existing.status}.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Guard condicionado por status: dos "marcar listo" concurrentes no
      // disparan dos WhatsApp ni doble transición.
      const claim = await tx.sale.updateMany({
        where: { id: saleId, status: 'PAGADO' },
        data: { status: 'LISTO_DESPACHO', readyAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('El pedido cambió de estado. Refrescá.');
      }
      await tx.saleStatusLog.create({
        data: { saleId, statusFrom: 'PAGADO', statusTo: 'LISTO_DESPACHO', userId },
      });
      return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: includeFull() });
    });

    await this.audit.log({
      userId,
      action: 'SALE_STATUS_CHANGED',
      entityType: 'sale',
      entityId: saleId,
      metadata: { from: 'PAGADO', to: 'LISTO_DESPACHO', by: 'mark-ready' },
    });
    const dto = toSaleDto(updated);
    void this.notifications.notify(saleId, 'pickup_ready');
    return dto;
  }

  /**
   * Defensa server-side de las partes de pago (no confiar solo en el Zod del
   * controller): suma exacta al total, comprobante verificado por cada parte
   * digital (y monto exacto si declara recibido), efectivo recibido >= parte.
   */
  private async assertPaymentParts(
    parts: readonly SalePaymentInput[],
    total: number,
  ): Promise<void> {
    // Solo métodos habilitados por el admin (medios de pago configurables).
    const enabled = await this.paymentMethods.enabledSet();
    const disabledPart = parts.find((p) => !enabled.has(p.method));
    if (disabledPart) {
      throw new BadRequestException(
        `El medio de pago ${disabledPart.method} no está habilitado. Configuralo en el admin.`,
      );
    }
    const sum = parts.reduce((acc, p) => acc + p.amount, 0);
    if (Math.abs(sum - total) > 0.005) {
      throw new BadRequestException(
        `Las partes suman ${roundMoney(sum)} pero el total es ${total}. La cuenta debe quedar exacta.`,
      );
    }
    for (const p of parts) {
      const isDigital = (DIGITAL_PAYMENT_METHODS as readonly PaymentMethod[]).includes(
        p.method as PaymentMethod,
      );
      if (isDigital) {
        if (!p.digitalVerified) {
          throw new BadRequestException(
            `La parte en ${p.method} requiere verificar su comprobante (digitalVerified).`,
          );
        }
        if (p.amountReceived !== undefined && Math.abs(p.amountReceived - p.amount) > 0.005) {
          throw new BadRequestException(
            `Pago digital: el monto debe ser exacto a la parte (${p.amount}).`,
          );
        }
      }
      if (p.method === 'CASH' && p.amountReceived !== undefined && p.amountReceived < p.amount - 0.005) {
        throw new BadRequestException(
          `Efectivo recibido (${p.amountReceived}) menor que la parte a cubrir (${p.amount}).`,
        );
      }
    }
  }

  // ==================================================================
  // VOID
  // ==================================================================

  /**
   * Verifica el PIN de aprobación (Admin/Dueño) para una acción sensible
   * (anular/reembolsar). Audita el rechazo y devuelve el id del aprobador.
   * Compartido por `void` y `refund`.
   */
  private async verifyApproval(
    saleId: string,
    cashierId: string,
    approverPin: string,
    reason: 'void' | 'refund',
  ): Promise<string> {
    return this.approvals.verify(approverPin).catch(async (err) => {
      await this.audit.log({
        userId: cashierId,
        action: 'APPROVAL_DENIED',
        entityType: 'sale',
        entityId: saleId,
        metadata: { reason, message: err instanceof Error ? err.message : 'invalid pin' },
      });
      throw err instanceof ForbiddenException ? err : new ForbiddenException('PIN inválido');
    });
  }

  /**
   * Caja destino del movimiento de DEVOLUCIÓN de una anulación/reembolso.
   * Si la caja de la venta sigue ABIERTA no hace falta nada (su esperado
   * excluye VOID y se auto-corrige). Si ya CERRÓ, la plata sale físicamente
   * del cajón de la caja abierta ACTUAL: sin un movimiento OUT, esa caja
   * cerraría con faltante falso y la vieja quedaría "cuadrada" con plata que
   * ya no está (auditoría 2026-07-05). Sin caja abierta → se bloquea.
   */
  private async resolveRefundMovementShift(
    saleShiftId: string | null,
    userId: string,
  ): Promise<string | null> {
    if (!saleShiftId) return null;
    const original = await this.prisma.shift.findUnique({
      where: { id: saleShiftId },
      select: { status: true },
    });
    if (original?.status === 'OPEN') return null;
    const current = await this.shifts.getActiveTodayShift(userId);
    if (!current) {
      throw new BadRequestException(
        'La caja de esta venta ya cerró: abrí caja para registrar la devolución de la plata.',
      );
    }
    return current.id;
  }

  /**
   * Movimientos OUT (uno por parte de pago, respetando el método) que
   * registran la devolución en la caja abierta actual. Se crean DENTRO de la
   * tx del void/refund, re-verificando que esa caja siga abierta.
   */
  private async createRefundMovements(
    tx: Prisma.TransactionClient,
    movementShiftId: string,
    sale: {
      payments: ReadonlyArray<{ method: PaymentMethod; amount: Prisma.Decimal | number }>;
      receiptNumber: bigint | number;
      total: Prisma.Decimal | number;
      paymentMethod: PaymentMethod | null;
    },
    userId: string,
    kind: 'anulada' | 'reembolsada',
  ): Promise<void> {
    const shift = await tx.shift.findUnique({
      where: { id: movementShiftId },
      select: { status: true },
    });
    if (!shift || shift.status !== 'OPEN') {
      throw new BadRequestException(
        'La caja se cerró mientras se registraba la devolución. Abrí caja e intentá de nuevo.',
      );
    }
    // Venta histórica sin filas en sale_payments (previa a la tabla o migrada):
    // igual hay que registrar la salida — un solo OUT por el total con el
    // método resumen (CASH como último recurso). Sin esto la caja actual
    // cerraría con faltante falso.
    const parts =
      sale.payments.length > 0
        ? sale.payments
        : [{ method: sale.paymentMethod ?? ('CASH' as PaymentMethod), amount: sale.total }];
    await tx.cashMovement.createMany({
      data: parts.map((p) => ({
        shiftId: movementShiftId,
        type: 'OUT' as const,
        method: p.method,
        amount: p.amount,
        reason: `Devolución venta #${sale.receiptNumber} ${kind} (su caja ya había cerrado)`,
        userId,
      })),
    });
  }

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
    const approverId = await this.verifyApproval(saleId, cashierId, approverPin, 'void');

    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
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
    const movementShiftId = await this.resolveRefundMovementShift(existing.shiftId, cashierId);

    const oldStatus = existing.status;
    let reversedCount = 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Guard transaccional: el status se condiciona DENTRO del UPDATE. Si entre
      // el check de arriba y la tx la cocina inició el pedido (PAGADO→EN_PREPARACION),
      // count===0 y abortamos sin revertir stock de una orden ya en preparación.
      // El UPDATE toma el lock de la fila sale → serializa contra un editItems
      // concurrente que ajustaría stock de la misma venta.
      const res = await tx.sale.updateMany({
        where: { id: saleId, status: 'PAGADO' },
        data: { status: 'VOID', voidReason: input.reason },
      });
      if (res.count === 0) {
        throw new BadRequestException(
          'No se puede anular: el pedido cambió de estado (la cocina lo inició).',
        );
      }
      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: oldStatus,
          statusTo: 'VOID',
          userId: cashierId,
          notes: `void: ${input.reason}`,
        },
      });
      // El pedido estaba PAGADO → descontó stock al cobrarse. Se revierte con
      // movements compensatorios (insert-only, type=SALE). La lectura va DENTRO
      // de la tx, DESPUÉS del UPDATE: así incluye cualquier ajuste de un
      // editItems que se haya serializado antes.
      //
      // Se emite UN reverso por stockable = NETO consumido (suma de TODOS los
      // movements SALE de la venta: cobro + ajustes de edición), no uno por cada
      // movement. Razón: el ledger FIFO devuelve `delta` unidades por reverso; si
      // se revirtiera cada movement por separado (ej. +10 del cobro y −3 de una
      // edición), el reverso parcial quedaría descoordinado y el costo/stock del
      // FIFO no netearía a cero. El neto (+7) lo resuelve de una.
      const originals = await tx.inventoryMovement.findMany({
        where: { sourceType: 'sale', sourceId: saleId, type: 'SALE' },
      });
      const reverseMovements = buildNetReverseMovements(originals, {
        saleId,
        userId: cashierId,
        notes: `Reverso de void · ${input.reason.slice(0, 100)}`,
      });
      if (reverseMovements.length > 0) {
        await tx.inventoryMovement.createMany({ data: reverseMovements });
      }
      reversedCount = reverseMovements.length;
      // Caja de la venta CERRADA → la plata devuelta sale de la caja actual.
      if (movementShiftId) {
        await this.createRefundMovements(
          tx,
          movementShiftId,
          {
            payments: existing.payments,
            receiptNumber: existing.receiptNumber,
            total: existing.total,
            paymentMethod: existing.paymentMethod,
          },
          cashierId,
          'anulada',
        );
      }
      return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: includeFull() });
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
        movementsReversed: reversedCount,
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
        total: dto.total,
        reason: input.reason,
      }),
      { saleId, receiptNumber: dto.receiptNumber },
    );
    return dto;
  }

  // ==================================================================
  // REFUND (reembolso de un pedido que la cocina YA inició)
  // ==================================================================

  /**
   * Reembolsa un pedido ya entregado/retirado: hoy aplica a un pedido web en
   * LISTO_DESPACHO (más EN_PREPARACION/ENTREGADO en datos históricos previos a
   * la eliminación del KDS). Requiere PIN de Admin/Dueño. A diferencia del void:
   *  - NO revierte stock: la comida ya se preparó/entregó → es una pérdida.
   *  - El pedido pasa a VOID (se excluye de ingresos y del arqueo) → la plata
   *    devuelta al cliente queda reflejada (el cajero entrega el efectivo /
   *    reversa la transferencia; el esperado de caja ya no la incluye).
   * Para anular un PAGADO de mostrador (no retirado), se usa `void`.
   */
  async refund(
    saleId: string,
    input: VoidSale,
    cashierId: string,
    approverPin: string,
  ): Promise<Sale> {
    const approverId = await this.verifyApproval(saleId, cashierId, approverPin, 'refund');

    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        status: true,
        type: true,
        shiftId: true,
        receiptNumber: true,
        total: true,
        paymentMethod: true,
        payments: true,
      },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    const REFUNDABLE = ['EN_PREPARACION', 'LISTO_DESPACHO', 'ENTREGADO'] as const;
    if (!REFUNDABLE.includes(existing.status as (typeof REFUNDABLE)[number])) {
      throw new BadRequestException(
        existing.status === 'PAGADO'
          ? 'La cocina aún no inició este pedido — usá "Anular" (revierte el stock).'
          : `No se puede reembolsar en estado ${existing.status}.`,
      );
    }
    const movementShiftId = await this.resolveRefundMovementShift(existing.shiftId, cashierId);

    const oldStatus = existing.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.sale.updateMany({
        where: { id: saleId, status: oldStatus },
        data: { status: 'VOID', voidReason: `${REFUND_VOID_REASON_PREFIX} ${input.reason}` },
      });
      if (res.count === 0) {
        throw new BadRequestException('El pedido cambió de estado — recargá e intentá de nuevo.');
      }
      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: oldStatus,
          statusTo: 'VOID',
          userId: cashierId,
          notes: `reembolso: ${input.reason}`,
        },
      });
      // Caja de la venta CERRADA → la plata devuelta sale de la caja actual.
      if (movementShiftId) {
        await this.createRefundMovements(
          tx,
          movementShiftId,
          {
            payments: existing.payments,
            receiptNumber: existing.receiptNumber,
            total: existing.total,
            paymentMethod: existing.paymentMethod,
          },
          cashierId,
          'reembolsada',
        );
      }
      return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: includeFull() });
    });

    await this.audit.log({
      userId: cashierId,
      action: 'SALE_REFUNDED',
      entityType: 'sale',
      entityId: saleId,
      metadata: { reason: input.reason, approverId, oldStatus },
    });
    await this.audit.log({
      userId: approverId,
      action: 'APPROVAL_GRANTED',
      entityType: 'sale',
      entityId: saleId,
      metadata: { reason: 'refund', cashierId },
    });

    const dto = toSaleDto(updated);
    void this.ownerNotifications.alert(
      'sale_voided',
      buildVoidAlertMessage({
        businessName: process.env.BUSINESS_NAME ?? 'Tercos',
        cashierName: dto.cashierName ?? null,
        receiptNumber: dto.receiptNumber,
        total: dto.total,
        reason: `REEMBOLSO — ${input.reason}`,
      }),
      { saleId, receiptNumber: dto.receiptNumber, refund: true },
    );
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
  async cancelUnpaid(saleId: string, cashierId: string): Promise<Sale> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { type: true, status: true, isOpenTab: true },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    // Idempotente: si ya quedó CANCELADO_NO_PAGO (ej. el cleanup del POS cancela
    // una venta huérfana y handleClose la cancela de nuevo), devolver la venta
    // sin error — el estado final deseado ya está. Evita un 400 ruidoso.
    if (existing.status === 'CANCELADO_NO_PAGO') {
      const already = await this.prisma.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: includeFull(),
      });
      return toSaleDto(already);
    }
    if (existing.status !== 'PENDIENTE_PAGO') {
      throw new BadRequestException(
        `No se puede cancelar: el pedido está en ${existing.status}.`,
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
          notes:
            existing.type === 'WEB_PICKUP'
              ? 'Pedido web rechazado por el cajero'
              : existing.isOpenTab
                ? 'Cuenta abierta cancelada por el cajero'
                : 'Cobro abandonado en el mostrador',
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

export interface ComputedSaleItem {
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
  /** Descuento manual de la línea (#5b) — null si el descuento vino de promo. */
  manualDiscountKind: 'FIXED' | 'PERCENT' | null;
  manualDiscountValue: number | null;
}

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { sizes: true; modifiers: true };
}>;

export function computeLine(
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

  // Descuento MANUAL de línea (#5b): excluyente con promos — el caller ya
  // desactivó el motor (activePromotions=[]) si la venta trae descuento manual.
  if (input.manualDiscount) {
    const lineDiscount = manualDiscountAmount(lineSubtotal, input.manualDiscount);
    return {
      productId: product.id,
      sizeId,
      quantity: input.quantity,
      unitPrice,
      modifiers,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      appliedPromotionId: null,
      lineSubtotal,
      lineDiscount,
      lineTotal: roundMoney(lineSubtotal - lineDiscount),
      manualDiscountKind: input.manualDiscount.kind,
      manualDiscountValue: input.manualDiscount.value,
    };
  }

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
    manualDiscountKind: null,
    manualDiscountValue: null,
  };
}
