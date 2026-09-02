import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SHIFT_CLOSE_SYSTEM,
  buildDiscrepancyAlertLink,
  buildDiscrepancyAlertMessage,
  buildOwnerAlert,
  buildShiftCloseUserPrompt,
  businessDayWindow,
  netOfDeliveryFee,
  startOfBusinessDay,
} from '@pos-tercos/domain';
import { NON_REVENUE_SALE_STATUSES, paymentMethodLabel } from '@pos-tercos/types';
import type {
  AiSummary,
  CashCountLine,
  DigitalCountLine,
  CashMovement,
  CloseShift,
  CreateCashMovement,
  ExpectedCash,
  OpenShift,
  Shift,
  SaleStatus,
  ShiftSessionDetail,
  ShiftStatus,
  SyncOfflineShiftOpen,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { LLMService } from '../adapters/llm/llm.service';
import { AuditService } from '../audit/audit.service';
import { businessName } from '../common/business-name';
import { runWithSerializationRetry } from '../common/tx';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';

/**
 * Threshold de descuadre absoluto (COP) que dispara `SHIFT_DISCREPANCY_DETECTED`.
 * Por debajo de esto, la diferencia se registra pero no se considera anomalía.
 */
const DISCREPANCY_THRESHOLD_COP = 5_000;

/**
 * Estados cuyo dinero NO entra al turno (inverso de las ventas que cuentan).
 * Fuente única: `NON_REVENUE_SALE_STATUSES`. Se usa como `notIn` en las queries
 * de caja y como predicado en memoria — así las ventas que cuentan plata
 * (PAGADO… + CANCELADO_SIN_REEMBOLSO) nunca divergen entre cálculos.
 */
const NON_REVENUE_STATUSES_ARR: SaleStatus[] = [...NON_REVENUE_SALE_STATUSES];
const isRevenueSale = (status: string): boolean =>
  !NON_REVENUE_STATUSES_ARR.includes(status as SaleStatus);

/**
 * Clave del advisory lock que serializa apertura/reapertura de caja. El check
 * "¿ya hay una caja OPEN?" + el create/update no son atómicos por sí solos
 * (TOCTOU): dos aperturas concurrentes podrían crear DOS cajas OPEN, rompiendo
 * la invariante de caja única. Tomar este lock transaccional fuerza que solo
 * una corra el check a la vez; la segunda ve la caja ya creada y es rechazada.
 */
const SHIFT_OPEN_LOCK_KEY = 911_025;

/**
 * Una apertura offline solo puede haber ocurrido en el PASADO (misma guarda
 * que las ventas offline en SalesOfflineService).
 */
const MAX_FUTURE_CLOCK_DRIFT_MS = 15 * 60 * 1000;

type DbShiftWithCashier = Prisma.ShiftGetPayload<{
  include: { cashier: { select: { fullName: true } } };
}>;

/**
 * Turnos de caja. FASE 5.B implementa solo apertura + lectura del turno
 * actual. Cierre (`closeShift`), cálculo de `expected_cash` y conciliación
 * con descuadre llegan en FASE 11 — schema y types ya están listos.
 */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly llm: LLMService,
    private readonly ownerNotifications: OwnerNotificationService,
    private readonly recipes: RecipesService,
    private readonly paymentMethods: PaymentMethodsService,
  ) {}

  /**
   * Asistente de cierre (IA): explica en lenguaje natural cómo quedó la caja y
   * la causa probable de la diferencia. Solo sobre una caja CERRADA. On-demand
   * (cuesta tokens), no automático.
   */
  async analyzeClose(shiftId: string): Promise<AiSummary> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        openingCash: true,
        expectedCash: true,
        countedCash: true,
        difference: true,
        status: true,
        openedAt: true,
        closedAt: true,
      },
    });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    if (shift.status === 'OPEN' || shift.expectedCash === null || shift.countedCash === null) {
      throw new BadRequestException('Cierra la caja antes de analizarla con IA.');
    }

    const [cashPayments, { cashIn, cashOut }, voidCount, noSaleDrawerCount] =
      await Promise.all([
        // NETO del envío, igual que el expectedCash contra el que el LLM
        // compara: con el bruto, la identidad "apertura + ventas + entradas −
        // salidas" no cerraba en cajas con domicilios en efectivo y la IA
        // explicaba un descuadre inexistente.
        this.prisma.salePayment.findMany({
          where: {
            method: 'CASH',
            sale: {
              shiftId,
              status: { notIn: NON_REVENUE_STATUSES_ARR },
            },
          },
          select: { amount: true, sale: { select: { total: true, deliveryFee: true } } },
        }),
        this.sumCashMovements(shiftId),
        this.prisma.sale.count({ where: { shiftId, status: 'VOID' } }),
        this.prisma.auditLog.count({
          where: {
            action: 'CASH_DRAWER_OPENED_NO_SALE',
            createdAt: { gte: shift.openedAt, lte: shift.closedAt ?? new Date() },
          },
        }),
      ]);

    const result = await this.llm.complete({
      systemPrompt: SHIFT_CLOSE_SYSTEM,
      userPrompt: buildShiftCloseUserPrompt({
        openingCash: Math.round(Number(shift.openingCash)),
        cashSalesTotal: Math.round(
          cashPayments.reduce(
            (acc, p) =>
              acc +
              netOfDeliveryFee(
                Number(p.amount),
                Number(p.sale.total),
                Number(p.sale.deliveryFee ?? 0),
              ),
            0,
          ),
        ),
        cashIn,
        cashOut,
        expectedCash: Math.round(Number(shift.expectedCash)),
        countedCash: Math.round(Number(shift.countedCash)),
        difference: Math.round(Number(shift.difference ?? 0)),
        voidCount,
        noSaleDrawerCount,
      }),
      maxTokens: 250,
    });
    return {
      text: result.text,
      modelUsed: result.modelUsed,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Abre la caja del negocio. UNA sola caja abierta a la vez en TODO el negocio
   * (no por cajero): si el dueño ya abrió, el cajero no puede abrir otra y
   * viceversa — es un solo negocio, una sola caja. Quien la abre es el dueño de
   * la sesión del día; todo el flujo de ventas de ese día va a esa caja.
   */
  async open(input: OpenShift, cashierId: string): Promise<Shift> {
    const created = await this.prisma.$transaction(async (tx) => {
      // Serializa el check+create contra aperturas concurrentes (TOCTOU).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SHIFT_OPEN_LOCK_KEY})`;

      // ¿Ya hay una caja ABIERTA (de cualquiera)? → no se abre otra.
      const openAnywhere = await tx.shift.findFirst({
        where: { status: 'OPEN' },
        select: { id: true, openedAt: true, cashier: { select: { fullName: true } } },
        orderBy: { openedAt: 'desc' },
      });
      if (openAnywhere) {
        const who = openAnywhere.cashier?.fullName ?? 'otro usuario';
        const sameDay = openAnywhere.openedAt >= this.startOfBusinessToday();
        throw new ConflictException(
          sameDay
            ? `Ya hay una caja abierta por ${who}. Solo puede haber una caja abierta en el negocio.`
            : `Hay una caja abierta por ${who} desde ${formatOpenedAt(openAnywhere.openedAt)} (día anterior). Hay que cerrarla antes de abrir la de hoy.`,
        );
      }

      // UNA caja por día de NEGOCIO (4 am → 4 am): si hoy ya hubo una (cerrada),
      // no se abre otra — cerrar a las 2 am y reabrir a las 3 am sigue bloqueado
      // (mismo día de negocio), pero la caja del día siguiente abre normal.
      // Si se cerró por error, el admin la reabre (no se crea una segunda).
      const { start: startOfDay, end: endOfDay } = businessDayWindow(new Date());
      const todays = await tx.shift.findFirst({
        where: { openedAt: { gte: startOfDay, lt: endOfDay } },
        select: { id: true },
      });
      if (todays) {
        throw new ConflictException(
          'La caja de hoy ya fue cerrada. No se abre una segunda el mismo día — si fue un error, pídele al admin que la reabra.',
        );
      }

      return tx.shift.create({
        data: {
          cashierId,
          openingCash: input.openingCash,
          notes: input.notes ?? null,
          status: 'OPEN',
        },
        include: { cashier: { select: { fullName: true } } },
      });
    });

    await this.audit.log({
      userId: cashierId,
      action: 'SHIFT_OPENED',
      entityType: 'shift',
      entityId: created.id,
      metadata: { openingCash: input.openingCash },
    });

    return toShiftDto(created);
  }

  /**
   * Sincroniza una apertura de caja hecha OFFLINE en el POS (B.4b). Reglas:
   *  - Idempotente por `localId` (reintentos devuelven la misma caja).
   *  - `openedAt` se backdatea al momento real de la apertura offline. Si la
   *    apertura fue de un día de NEGOCIO anterior (corte 4 am), la caja nace
   *    "stale": el POS obliga a cerrarla (arqueo de ayer) antes de operar
   *    hoy — flujo honesto, no se pierde el registro.
   *  - Si ya hay una caja OPEN de HOY (alguien abrió online mientras tanto, o
   *    otro dispositivo sincronizó primero): se ADOPTA esa caja — caja única
   *    del negocio; la discrepancia de fondo inicial queda en bitácora.
   *  - Si la caja OPEN es de un día anterior, o la caja del día de la apertura
   *    ya existe cerrada → Conflict (mismas reglas que la apertura online).
   *  - Reloj adelantado >15 min → rechazo (misma guarda que las ventas offline).
   */
  async syncOfflineOpen(
    input: SyncOfflineShiftOpen,
    cashierId: string,
  ): Promise<{ shift: Shift; adopted: boolean }> {
    const openedAt = new Date(input.openedOfflineAt);
    const driftMs = openedAt.getTime() - Date.now();
    if (driftMs > MAX_FUTURE_CLOCK_DRIFT_MS) {
      throw new BadRequestException(
        `El reloj del POS está adelantado ${Math.round(driftMs / 60_000)} min respecto al servidor. Corrige la hora del dispositivo y reintenta.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Mismo lock que open(): serializa contra aperturas concurrentes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SHIFT_OPEN_LOCK_KEY})`;

      const dup = await tx.shift.findUnique({
        where: { offlineLocalId: input.localId },
        include: { cashier: { select: { fullName: true } } },
      });
      if (dup) return { row: dup, adopted: false, idempotent: true };

      const openAnywhere = await tx.shift.findFirst({
        where: { status: 'OPEN' },
        include: { cashier: { select: { fullName: true } } },
        orderBy: { openedAt: 'desc' },
      });
      if (openAnywhere) {
        if (openAnywhere.openedAt < this.startOfBusinessToday()) {
          const who = openAnywhere.cashier?.fullName ?? 'otro usuario';
          throw new ConflictException(
            `Hay una caja abierta por ${who} desde ${formatOpenedAt(openAnywhere.openedAt)} (día anterior). Hay que cerrarla antes de sincronizar la apertura offline.`,
          );
        }
        // Adoptar la caja del día. Estampar el localId (si está libre) hace
        // idempotentes los reintentos de ESTE dispositivo.
        const adopted =
          openAnywhere.offlineLocalId === null
            ? await tx.shift.update({
                where: { id: openAnywhere.id },
                data: { offlineLocalId: input.localId },
                include: { cashier: { select: { fullName: true } } },
              })
            : openAnywhere;
        return { row: adopted, adopted: true, idempotent: false };
      }

      // UNA caja por día de NEGOCIO DEL DÍA DE LA APERTURA offline.
      const { start: dayStart, end: dayEnd } = businessDayWindow(openedAt);
      const sameDay = await tx.shift.findFirst({
        where: { openedAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true },
      });
      if (sameDay) {
        throw new ConflictException(
          'La caja de ese día ya existe y está cerrada. Las ventas offline van a colgarse de la caja abierta de hoy — si falta la apertura, pídele al admin que la reabra.',
        );
      }

      const row = await tx.shift.create({
        data: {
          cashierId,
          openingCash: input.openingCash,
          notes: input.notes ?? null,
          status: 'OPEN',
          openedAt,
          offlineLocalId: input.localId,
        },
        include: { cashier: { select: { fullName: true } } },
      });
      return { row, adopted: false, idempotent: false };
    });

    if (!result.idempotent) {
      await this.audit.log({
        userId: cashierId,
        action: 'SHIFT_OPENED',
        entityType: 'shift',
        entityId: result.row.id,
        metadata: {
          offline: true,
          localId: input.localId,
          adopted: result.adopted,
          openedOfflineAt: input.openedOfflineAt,
          openingCash: input.openingCash,
          ...(result.adopted && Number(result.row.openingCash) !== input.openingCash
            ? {
                openingCashMismatch: {
                  offline: input.openingCash,
                  existing: Number(result.row.openingCash),
                },
              }
            : {}),
        },
      });
    }

    return { shift: toShiftDto(result.row), adopted: result.adopted };
  }

  /**
   * Caja ABIERTA del negocio (única, de cualquier usuario). Null si no hay.
   */
  async getCurrent(_userId: string): Promise<Shift | null> {
    const row = await this.prisma.shift.findFirst({
      where: { status: 'OPEN' },
      include: { cashier: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
    return row ? toShiftDto(row) : null;
  }

  /**
   * Inicio del día de NEGOCIO actual (corte 4 am, hora local del server —
   * TZ=America/Bogota en prod). La caja abierta el jueves a la tarde sigue
   * siendo "la de hoy" hasta las 3:59 am del viernes: el local puede vender
   * de madrugada sin que la caja se vuelva stale ni bloquee el día siguiente.
   * OJO: esto NO cambia la atribución contable de las ventas (reportes siguen
   * en día calendario por `paidAt`) — solo la operación de la caja.
   */
  private startOfBusinessToday(): Date {
    return startOfBusinessDay(new Date());
  }

  /**
   * Turno con el que el cajero puede operar HOY (día de NEGOCIO, corte 4 am:
   * la caja del jueves sigue operable hasta las 3:59 am del viernes). Si dejó
   * una caja OPEN de un día de negocio anterior (nunca la cerró), lanza
   * Conflict: debe cerrarla (Cerrar turno, ingresando el efectivo con el que
   * quedó) antes de seguir. Si no hay caja OPEN, retorna null. Es el guard de
   * "movimientos solo con la caja del día".
   */
  async getActiveTodayShift(_userId: string): Promise<Shift | null> {
    // Caja ÚNICA del negocio (de cualquier usuario): el que esté operando vende
    // sobre la caja abierta, sin importar quién la abrió.
    const row = await this.prisma.shift.findFirst({
      where: { status: 'OPEN' },
      include: { cashier: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
    if (!row) return null;
    if (row.openedAt < this.startOfBusinessToday()) {
      throw new ConflictException(
        `La caja sigue abierta desde el ${formatOpenedAt(row.openedAt)}. ` +
          `Ciérrala (Cerrar turno) e ingresa el efectivo con el que quedó antes de seguir operando.`,
      );
    }
    return toShiftDto(row);
  }

  /**
   * Estado de caja para la UI (no lanza): el turno OPEN actual + si quedó
   * abierto de un día anterior y hay que cerrarlo antes de poder operar/abrir
   * uno nuevo.
   */
  async getCurrentStatus(
    _userId: string,
  ): Promise<{ shift: Shift | null; stalePreviousDay: boolean }> {
    // Caja ÚNICA del negocio (de cualquier usuario).
    const row = await this.prisma.shift.findFirst({
      where: { status: 'OPEN' },
      include: { cashier: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
    if (!row) return { shift: null, stalePreviousDay: false };
    return {
      shift: toShiftDto(row),
      stalePreviousDay: row.openedAt < this.startOfBusinessToday(),
    };
  }

  async getById(id: string): Promise<Shift> {
    const row = await this.prisma.shift.findUnique({
      where: { id },
      include: { cashier: { select: { fullName: true } } },
    });
    if (!row) throw new NotFoundException(`Shift ${id} not found`);
    return toShiftDto(row);
  }

  /**
   * Reabre una caja CERRADA (admin) — recuperación de cierre por error.
   * Conserva el openingCash original y limpia el cierre para re-calcularlo.
   * Mantiene la MISMA sesión del día (no crea otra).
   */
  async reopen(shiftId: string, adminId: string): Promise<Shift> {
    const { row, cashierId } = await this.prisma.$transaction(async (tx) => {
      // Mismo lock que open(): serializa contra una apertura/reapertura
      // concurrente para no terminar con dos cajas OPEN.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SHIFT_OPEN_LOCK_KEY})`;

      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        select: { id: true, status: true, cashierId: true },
      });
      if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
      if (shift.status !== 'CLOSED') {
        throw new BadRequestException('Solo se reabre una caja CERRADA.');
      }
      // Caja ÚNICA por negocio: si ya hay CUALQUIER caja abierta (de este cajero o
      // de otro), reabrir crearía dos OPEN simultáneas → ventas/turnos repartidos
      // entre dos cajas y arqueo descuadrado. Hay que cerrar la abierta primero.
      const openAnywhere = await tx.shift.findFirst({
        where: { status: 'OPEN' },
        select: { id: true, cashier: { select: { fullName: true } } },
      });
      if (openAnywhere) {
        const who = openAnywhere.cashier?.fullName ?? 'otro usuario';
        throw new ConflictException(
          `Ya hay una caja abierta por ${who}. Ciérrala antes de reabrir esta — solo puede haber una caja abierta en el negocio.`,
        );
      }
      const updated = await tx.shift.update({
        where: { id: shiftId },
        data: {
          status: 'OPEN',
          closedAt: null,
          expectedCash: null,
          countedCash: null,
          difference: null,
        },
        include: { cashier: { select: { fullName: true } } },
      });
      return { row: updated, cashierId: shift.cashierId };
    });
    await this.audit.log({
      userId: adminId,
      action: 'SHIFT_REOPENED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: { cashierId },
    });
    return toShiftDto(row);
  }

  /**
   * Detalle consolidado de una sesión/caja: datos de caja + resumen + todos
   * los pedidos del turno. Lo ve el cajero (la suya) y el admin (cualquiera).
   */
  async getSessionDetail(shiftId: string, includeMargin = false): Promise<ShiftSessionDetail> {
    const shift = await this.getById(shiftId);
    const breakdownRow = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { cashCountBreakdown: true },
    });
    const cashCountBreakdown =
      (breakdownRow?.cashCountBreakdown as CashCountLine[] | null) ?? null;
    const cashMovements = await this.listCashMovements(shiftId);
    const rows = await this.prisma.sale.findMany({
      where: { shiftId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        receiptNumber: true,
        type: true,
        status: true,
        total: true,
        deliveryFee: true,
        paymentMethod: true,
        customerName: true,
        createdAt: true,
        discountTotal: true,
        orderDiscountAmount: true,
        discountReason: true,
        payments: { select: { method: true, amount: true } },
        items: {
          select: {
            productId: true,
            sizeId: true,
            quantity: true,
            unitPrice: true,
            lineDiscount: true,
            appliedPromotionId: true,
            manualDiscountKind: true,
            lineTotal: true,
            product: { select: { name: true } },
            size: { select: { name: true } },
          },
        },
      },
    });

    // Ganancia (costos) SOLO para roles con visibilidad de costos — nunca al cajero.
    // Cada línea se costea con SU variante: costear con la receta base cobraba
    // de menos justo lo que vale la proteína, que suele ser lo más caro del
    // plato. Una sola pasada por todo el catálogo; null si el costo se desconoce.
    const costs = includeMargin ? await this.recipes.buildCostLookup() : null;

    const orders = rows.map((r) => {
      // La ganancia solo tiene sentido en ventas que generaron ingreso. Un pedido
      // cancelado/anulado/pendiente NO dejó plata → margen null (mismo criterio que
      // el arqueo, `isRevenueSale`), para no mostrar "ganancia" en algo que no vendió.
      const earnsRevenue = includeMargin && isRevenueSale(r.status);
      const items = r.items.map((it) => {
        const unitCost = earnsRevenue ? (costs?.unitCost(it.productId, it.sizeId) ?? null) : null;
        const lineTotal = Number(it.lineTotal);
        const lineCost = unitCost !== null ? Math.round(unitCost * it.quantity) : null;
        const lineMargin = lineCost !== null ? lineTotal - lineCost : null;
        const lineMarginPct =
          lineMargin !== null && lineTotal > 0 ? lineMargin / lineTotal : null;
        return {
          quantity: it.quantity,
          name: it.size ? `${it.product.name} ${it.size.name}` : it.product.name,
          unitPrice: Number(it.unitPrice),
          lineDiscount: Number(it.lineDiscount),
          // Descuento por promo activa (appliedPromotionId) vs manual (kind sin promo).
          hasPromotion: it.appliedPromotionId !== null && it.manualDiscountKind === null,
          lineTotal,
          lineCost,
          lineMargin,
          lineMarginPct,
        };
      });
      // Margen del pedido: solo si TODAS las líneas tienen costo conocido (si falta
      // uno, el total sería engañoso). Revenue = total real cobrado (neto de descuentos).
      const orderTotal = Number(r.total);
      const allCostsKnown = items.length > 0 && items.every((i) => i.lineCost !== null);
      const costTotal = allCostsKnown
        ? items.reduce((a, i) => a + (i.lineCost ?? 0), 0)
        : null;
      const marginTotal = costTotal !== null ? orderTotal - costTotal : null;
      const marginPct =
        marginTotal !== null && orderTotal > 0 ? marginTotal / orderTotal : null;
      return {
        id: r.id,
        receiptNumber: Number(r.receiptNumber),
        type: r.type,
        status: r.status,
        total: orderTotal,
        deliveryFee: Number(r.deliveryFee ?? 0),
        paymentMethod: r.paymentMethod,
        customerName: r.customerName,
        createdAt: r.createdAt.toISOString(),
        discountTotal: Number(r.discountTotal),
        orderDiscountAmount: Number(r.orderDiscountAmount),
        discountReason: r.discountReason,
        payments: r.payments.map((p) => ({ method: p.method as string, amount: Number(p.amount) })),
        items,
        costTotal,
        marginTotal,
        marginPct,
      };
    });

    // "Pagado" para el resumen = la venta cuenta plata (mismo criterio que el
    // arqueo): todo menos NON_REVENUE_SALE_STATUSES (incluye CANCELADO_SIN_REEMBOLSO).
    const paidIds = new Set(orders.filter((o) => isRevenueSale(o.status)).map((o) => o.id));
    const paid = orders.filter((o) => paidIds.has(o.id));
    // Por método desde sale_payments: una cuenta DIVIDIDA aporta su parte a
    // cada método (count = cantidad de pagos, no de ventas).
    // NETO de envío (§7.v30): el domicilio se le paga al repartidor en el
    // momento, así que al cerrar esa plata ya no está en ningún medio. Se
    // prorratea por la parte que pagó cada uno.
    const byMethodMap = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      if (!paidIds.has(r.id)) continue;
      const fee = Number(r.deliveryFee ?? 0);
      const saleTotal = Number(r.total);
      for (const pay of r.payments) {
        const neto = netOfDeliveryFee(Number(pay.amount), saleTotal, fee);
        const bm = byMethodMap.get(pay.method) ?? { count: 0, total: 0 };
        byMethodMap.set(pay.method, { count: bm.count + 1, total: bm.total + neto });
      }
    }
    // byType también NETO de envío (§7.v30): si no, un domicilio mostraría
    // $45.000 en "Por tipo" y $38.000 en "Por método" en la misma pantalla.
    const byTypeMap = new Map<string, { count: number; total: number }>();
    for (const o of paid) {
      const bt = byTypeMap.get(o.type) ?? { count: 0, total: 0 };
      byTypeMap.set(o.type, {
        count: bt.count + 1,
        total: bt.total + o.total - (o.deliveryFee ?? 0),
      });
    }
    // cash/transfer desde sale_payments (byMethodMap) — split-aware: una cuenta
    // dividida aporta su porción a cada método (filtrar por sale.paymentMethod
    // daría $0 a las divididas, donde ese campo es null).
    return {
      shift,
      digitalCountBreakdown: shift.digitalCountBreakdown ?? null,
      summary: {
        orderCount: orders.length,
        paidCount: paid.length,
        voidCount: orders.filter((o) => o.status === 'VOID').length,
        canceledCount: orders.filter(
          (o) => o.status === 'CANCELADO_NO_PAGO' || o.status === 'CANCELADO_SIN_REEMBOLSO',
        ).length,
        // NETO de envíos: el domicilio no es venta del negocio (§7.v24).
        totalRevenue: paid.reduce((a, o) => a + o.total - (o.deliveryFee ?? 0), 0),
        deliveryCollected: paid.reduce((a, o) => a + (o.deliveryFee ?? 0), 0),

        cashRevenue: byMethodMap.get('CASH')?.total ?? 0,
        transferRevenue: byMethodMap.get('TRANSFER')?.total ?? 0,
        byMethod: [...byMethodMap.entries()].map(([method, v]) => ({ method, ...v })),
        byType: [...byTypeMap.entries()].map(([type, v]) => ({ type, ...v })),
      },
      orders,
      cashMovements,
      cashCountBreakdown,
    };
  }

  /**
   * FASE 11.A: cierre del turno. Calcula `expectedCash` desde apertura +
   * ventas CASH PAGADAS del turno; lo compara con `countedCash` declarado
   * por el cajero. Si |diff| >= DISCREPANCY_THRESHOLD_COP → audit
   * `SHIFT_DISCREPANCY_DETECTED` (en FASE 9 + WhatsApp se enviará alerta).
   *
   * Solo el cajero dueño del turno puede cerrarlo. El status pasa a CLOSED;
   * RECONCILED se reservará para FASE 11.E (post import CSV).
   */
  async close(
    shiftId: string,
    input: CloseShift,
    cashierId: string,
    isAdmin = false,
  ): Promise<Shift> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        cashierId: true,
        status: true,
        openingCash: true,
        openedAt: true,
      },
    });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    // La cierra quien la abrió, o cualquier admin/dueño (caja única del negocio).
    if (shift.cashierId !== cashierId && !isAdmin) {
      throw new ForbiddenException(
        'Solo quien abrió la caja o un admin/dueño puede cerrarla.',
      );
    }
    if (shift.status !== 'OPEN') {
      throw new BadRequestException(
        `Shift está en status ${shift.status}, ya no se puede cerrar.`,
      );
    }

    // Efectivo que debe estar en el cajón: la porción CASH de cada venta
    // cobrada (sale_payments es la fuente de verdad — una cuenta dividida
    // solo aporta su parte en efectivo). Excluye VOID (reembolsado → neto 0)
    // Efectivo esperado: el MISMO cálculo autoritativo que el POS muestra al
    // cerrar (vía getExpectedCash) → cero divergencia entre el target del
    // cajero y la diferencia registrada.
    //
    // Nombres vivos del catálogo para el mensaje de "falta arquear" — se leen
    // ANTES de abrir la tx (nada de IO ajeno adentro de la serializable).
    const methodNames = new Map(
      (await this.paymentMethods.listAll()).map((m) => [m.code, m.name]),
    );

    // Tx SERIALIZABLE (auditoría 2026-07-05): el cierre LEE sale_payments y
    // ESCRIBE shift.status; el cobro (tx serializable) LEE shift.status y
    // ESCRIBE sale_payments. En READ COMMITTED un cobro concurrente podía
    // colarse ENTRE el cómputo del esperado y el update a CLOSED → arqueo con
    // sobrante falso (plata cobrada que el esperado congelado no incluía).
    // Con ambas tx serializables, Postgres aborta una (40001) y el retry
    // recomputa con la foto consistente. El advisory lock serializa además
    // contra open/reopen.
    const { closed, expectedCash, cashSalesTotal, cashIn, cashOut, difference, digitalBreakdown } =
      await runWithSerializationRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SHIFT_OPEN_LOCK_KEY})`;
            const computed = await this.computeExpectedCash(
              shiftId,
              Number(shift.openingCash),
              tx,
            );
            const diff = Math.round(input.countedCash) - computed.expectedCash; // (+) sobrante, (-) faltante
            const digital = await this.computeDigitalBreakdown(
              shiftId,
              input.digitalCounts ?? [],
              tx,
            );
            // Arqueo de cuenta OBLIGATORIO: cerrar con un método sin contar
            // dejaba la caja "cuadrada" por el efectivo mientras la plata
            // digital quedaba sin verificar (y fuera del descuadre).
            const sinArquear = digital.filter((d) => d.counted === null);
            if (sinArquear.length > 0) {
              throw new BadRequestException(
                `Falta arquear ${sinArquear.map((d) => methodNames.get(d.method) ?? d.method).join(', ')}. Revisa cada app y anota cuánto entró; si no entró nada, escribe 0.`,
              );
            }
            const res = await tx.shift.updateMany({
              where: { id: shiftId, status: 'OPEN' },
              data: {
                status: 'CLOSED',
                closedAt: new Date(),
                expectedCash: computed.expectedCash,
                countedCash: input.countedCash,
                difference: diff,
                cashCountBreakdown: input.breakdown ?? undefined,
                digitalCountBreakdown:
                  digital.length > 0
                    ? (digital as unknown as Prisma.InputJsonValue)
                    : undefined,
                tipsCollected: input.tips ?? null,
                notes: input.notes ?? null,
              },
            });
            if (res.count === 0) {
              throw new BadRequestException('La caja ya fue cerrada.');
            }
            const row = await tx.shift.findUniqueOrThrow({
              where: { id: shiftId },
              include: { cashier: { select: { fullName: true } } },
            });
            return { closed: row, ...computed, difference: diff, digitalBreakdown: digital };
          },
          { isolationLevel: 'Serializable', timeout: 15_000 },
        ),
      );

    await this.audit.log({
      userId: cashierId,
      action: 'SHIFT_CLOSED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: {
        openingCash: Number(shift.openingCash),
        cashSalesTotal,
        cashIn,
        cashOut,
        expectedCash,
        countedCash: input.countedCash,
        difference,
        digitalDifference: sumDigitalDifference(digitalBreakdown),
        tips: input.tips ?? null,
      },
    });

    const cashFlagged = Math.abs(difference) >= DISCREPANCY_THRESHOLD_COP;
    if (cashFlagged) {
      await this.alertCashDiscrepancy(shiftId, cashierId, difference, {
        cashierName: closed.cashier.fullName,
        closedAt: closed.closedAt ?? new Date(),
      });
    }
    const digitalFlagged = await this.alertDigitalDiscrepancy(
      shiftId,
      cashierId,
      digitalBreakdown,
    );
    // Cada pata puede quedar bajo el umbral y aun así faltar plata: la novedad
    // se dispara también por el descuadre TOTAL (si no avisó ya una de ellas).
    const digitalDiff = sumDigitalDifference(digitalBreakdown);
    if (
      !cashFlagged &&
      !digitalFlagged &&
      Math.abs(difference + digitalDiff) >= DISCREPANCY_THRESHOLD_COP
    ) {
      await this.alertCombinedDiscrepancy(shiftId, cashierId, difference, digitalDiff);
    }

    return toShiftDto(closed);
  }

  /** Descuadre TOTAL (cajón + cuenta) sobre el umbral con ambas patas por debajo. */
  private async alertCombinedDiscrepancy(
    shiftId: string,
    cashierId: string,
    cashDifference: number,
    digitalDifference: number,
  ): Promise<void> {
    const total = cashDifference + digitalDifference;
    await this.audit.log({
      userId: cashierId,
      action: 'SHIFT_DISCREPANCY_DETECTED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: {
        kind: 'combined',
        cashDifference,
        digitalDifference,
        total,
        threshold: DISCREPANCY_THRESHOLD_COP,
      },
    });
    void this.ownerNotifications.alert(
      'shift_discrepancy',
      buildOwnerAlert({
        businessName: businessName(),
        title: 'Descuadre en el cierre de caja',
        body:
          `Efectivo: ${signedCop(cashDifference)}\n` +
          `Cuenta: ${signedCop(digitalDifference)}\n` +
          `Total: ${signedCop(total)}\n\n` +
          `Míralo en Turnos.`,
      }),
      { shiftId, discrepancyKind: 'combined' },
    );
  }

  /**
   * Arqueo DIGITAL: esperado por método (porción de cada venta en ese método,
   * desde sale_payments) + movimientos digitales (IN−OUT) vs lo que el cajero
   * vio en cada app. Una línea por método con counted/difference (null si no se
   * contó ese método).
   */
  private async computeDigitalBreakdown(
    shiftId: string,
    digitalCounts: NonNullable<CloseShift['digitalCounts']>,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<DigitalCountLine[]> {
    const expectedByMethod = await this.computeDigitalExpected(shiftId, db);
    const countedByMethod = new Map(
      (digitalCounts ?? []).map((d) => [d.method, Math.round(d.counted)]),
    );
    const methods = new Set<string>([...expectedByMethod.keys(), ...countedByMethod.keys()]);
    return [...methods].map((method) => {
      const expected = expectedByMethod.get(method) ?? 0;
      const counted = countedByMethod.get(method as DigitalCountLine['method']) ?? null;
      return {
        method: method as DigitalCountLine['method'],
        expected,
        counted,
        difference: counted !== null ? counted - expected : null,
      };
    });
  }

  /**
   * Esperado por método NO-efectivo: ventas del turno (sale_payments) más el
   * neto IN−OUT de los movimientos digitales. Fuente ÚNICA del arqueo de cuenta
   * — la usan el cierre (que lo EXIGE) y el target que ve el cajero.
   */
  private async computeDigitalExpected(
    shiftId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Map<string, number>> {
    // NETO de envío, igual que el efectivo (§7.v30): el domicilio se le paga al
    // repartidor EN EL MOMENTO, siempre — no hay cierre con domicilios sin
    // pagar. Al cerrar, esa plata ya salió, así que esperarla marcaría un
    // sobrante que no existe. Se prorratea por la parte que pagó cada medio.
    const digitalPayments = await db.salePayment.findMany({
      where: {
        method: { not: 'CASH' },
        sale: { shiftId, status: { notIn: NON_REVENUE_STATUSES_ARR } },
      },
      select: {
        method: true,
        amount: true,
        sale: { select: { total: true, deliveryFee: true } },
      },
    });
    const digitalExpectedRows = [
      ...digitalPayments
        .reduce((acc, p) => {
          const neto = netOfDeliveryFee(
            Number(p.amount),
            Number(p.sale?.total ?? 0),
            Number(p.sale?.deliveryFee ?? 0),
          );
          acc.set(p.method, (acc.get(p.method) ?? 0) + neto);
          return acc;
        }, new Map<string, number>())
        .entries(),
    ].map(([method, sum]) => ({ method, _sum: { amount: sum } }));
    // Movimientos digitales del turno (entradas/salidas por método).
    const digitalMovRows = await db.cashMovement.groupBy({
      by: ['method', 'type'],
      where: { shiftId, method: { not: 'CASH' } },
      _sum: { amount: true },
    });
    const digitalMovNet = new Map<string, number>();
    for (const r of digitalMovRows) {
      const amt = Math.round(Number(r._sum.amount ?? 0));
      digitalMovNet.set(
        r.method as string,
        (digitalMovNet.get(r.method as string) ?? 0) + (r.type === 'IN' ? amt : -amt),
      );
    }
    const methods = new Set<string>([
      ...digitalExpectedRows.map((r) => r.method as string),
      ...digitalMovNet.keys(),
    ]);
    const expected = new Map<string, number>();
    for (const method of methods) {
      expected.set(
        method,
        Math.round(
          Number(digitalExpectedRows.find((r) => r.method === method)?._sum.amount ?? 0),
        ) + (digitalMovNet.get(method) ?? 0),
      );
    }
    return expected;
  }

  /** Descuadre de EFECTIVO >= umbral: audit + link wa.me + alerta al dueño. */
  private async alertCashDiscrepancy(
    shiftId: string,
    cashierId: string,
    difference: number,
    closed: { cashierName: string; closedAt: Date },
  ): Promise<void> {
    // FASE 15.A: link wa.me en metadata para abrir desde /audit. Desde
    // 2026-06-10 además se ENVÍA directo al dueño vía WhatsApp (Kapso).
    const datos = {
      cashierName: closed.cashierName,
      difference,
      closedAt: closed.closedAt,
      businessName: businessName(),
    };
    const mensaje = buildDiscrepancyAlertMessage(datos);
    // El link wa.me es OPCIONAL y solo existe si hay teléfono: sirve para
    // abrir el chat desde /audit. El aviso NO depende de él.
    const alertLink = buildDiscrepancyAlertLink({
      ...datos,
      ownerPhone: process.env.OWNER_WHATSAPP_PHONE?.trim() ?? null,
      shiftId,
    });
    await this.audit.log({
      userId: cashierId,
      action: 'SHIFT_DISCREPANCY_DETECTED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: {
        difference,
        threshold: DISCREPANCY_THRESHOLD_COP,
        whatsappAlertUrl: alertLink?.url ?? null,
        whatsappAlertMessage: mensaje,
      },
    });
    // Fire-and-forget, y SIEMPRE: antes esto colgaba de `if (alertLink)`, así
    // que sin `OWNER_WHATSAPP_PHONE` un descuadre de efectivo no avisaba por
    // ningún canal. Los caminos digital y combinado nunca tuvieron ese enganche.
    void this.ownerNotifications.alert('shift_discrepancy', mensaje, {
      shiftId,
      difference,
      discrepancyKind: 'cash',
    });
  }

  /** Descuadre DIGITAL (lo que dice la app vs las ventas) >= umbral por método. */
  private async alertDigitalDiscrepancy(
    shiftId: string,
    cashierId: string,
    digitalBreakdown: DigitalCountLine[],
  ): Promise<boolean> {
    const digitalMismatch = digitalBreakdown.filter(
      (d) => d.difference !== null && Math.abs(d.difference) >= DISCREPANCY_THRESHOLD_COP,
    );
    if (digitalMismatch.length === 0) return false;
    // El code crudo (`TRANSFER`, `RAPPI`) no es lo que el cajero ve en pantalla
    // ni lo que el dueño llama a ese medio — el nombre sale del catálogo.
    const catalog = Object.fromEntries(
      (await this.paymentMethods.listAll()).map((m) => [m.code, m.name]),
    );
    const detail = digitalMismatch
      .map(
        (d) =>
          `${paymentMethodLabel(d.method, catalog)}: esperado $${d.expected.toLocaleString('es-CO')}, app $${(d.counted ?? 0).toLocaleString('es-CO')} (${signedCop(d.difference!)})`,
      )
      .join('\n');
    await this.audit.log({
      userId: cashierId,
      action: 'SHIFT_DISCREPANCY_DETECTED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: { kind: 'digital', digital: digitalMismatch, threshold: DISCREPANCY_THRESHOLD_COP },
    });
    void this.ownerNotifications.alert(
      'shift_discrepancy',
      buildOwnerAlert({
        businessName: businessName(),
        title: 'Descuadre en la cuenta al cerrar caja',
        body: `${detail}\n\nMíralo en Turnos.`,
      }),
      { shiftId, discrepancyKind: 'digital' },
    );
    return true;
  }

  /**
   * Efectivo esperado AUTORITATIVO de una caja (apertura + ventas CASH +
   * entradas − salidas). Única fuente para el cierre y para el target que el
   * POS muestra al cajero → no divergen. También responde para una caja ya
   * cerrada (recalcula desde las ventas); el expectedCash CONGELADO del cierre
   * vive en la fila del shift y es el que usan arqueos históricos.
   */
  async getExpectedCash(shiftId: string): Promise<ExpectedCash> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { openingCash: true, status: true },
    });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    const openingCash = Math.round(Number(shift.openingCash));
    const [r, digitalExpected, catalog] = await Promise.all([
      this.computeExpectedCash(shiftId, Number(shift.openingCash)),
      this.computeDigitalExpected(shiftId),
      this.paymentMethods.listAll(),
    ]);
    const names = new Map(catalog.map((m) => [m.code, m.name]));
    return {
      ...r,
      openingCash,
      // Los mismos métodos que `close` va a exigir arquear.
      digital: [...digitalExpected.entries()].map(([method, expected]) => ({
        method,
        name: names.get(method) ?? method,
        expected,
      })),
    };
  }

  /** Cálculo puro de efectivo esperado (compartido por close + getExpectedCash).
   *  `db` permite correrlo DENTRO de la tx serializable del cierre. */
  private async computeExpectedCash(
    shiftId: string,
    openingCash: number,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ expectedCash: number; cashSalesTotal: number; cashIn: number; cashOut: number }> {
    // Solo ventas que cuentan plata en efectivo: PAGADO en adelante; excluye
    // PENDIENTE_PAGO, VOID (reembolsado) y CANCELADO_NO_PAGO. Incluye
    // CANCELADO_SIN_REEMBOLSO (la plata quedó).
    //
    // El COSTO DEL DOMICILIO se descuenta (§7.v28): esa plata se le paga
    // directo al domiciliario y NUNCA entra al cajón — el repartidor solo
    // devuelve lo de la comida. Si se esperara, cada domicilio en efectivo
    // marcaría un faltante que no existe.
    const cashPayments = await db.salePayment.findMany({
      where: {
        method: 'CASH',
        sale: {
          shiftId,
          status: { notIn: NON_REVENUE_STATUSES_ARR },
        },
      },
      select: {
        amount: true,
        sale: { select: { total: true, deliveryFee: true } },
      },
    });
    const cashSalesTotal = Math.round(
      cashPayments.reduce(
        (acc, p) =>
          acc +
          // Cuenta dividida: solo la porción del envío que se pagó en efectivo.
          netOfDeliveryFee(
            Number(p.amount),
            Number(p.sale?.total ?? 0),
            Number(p.sale?.deliveryFee ?? 0),
          ),
        0,
      ),
    );
    const { cashIn, cashOut } = await this.sumCashMovements(shiftId, db);
    const expectedCash = Math.round(openingCash) + cashSalesTotal + cashIn - cashOut;
    return { expectedCash, cashSalesTotal, cashIn, cashOut };
  }

  /** Suma de movimientos de efectivo del turno (entradas y salidas), en COP. */
  private async sumCashMovements(
    shiftId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ cashIn: number; cashOut: number }> {
    const grouped = await db.cashMovement.groupBy({
      by: ['type'],
      // Solo EFECTIVO: los movimientos digitales ajustan el arqueo digital
      // de su método, no el cajón físico.
      where: { shiftId, method: 'CASH' },
      _sum: { amount: true },
    });
    let cashIn = 0;
    let cashOut = 0;
    for (const g of grouped) {
      const amt = Math.round(Number(g._sum.amount ?? 0));
      if (g.type === 'IN') cashIn = amt;
      else cashOut = amt;
    }
    return { cashIn, cashOut };
  }

  /**
   * Registra una entrada/salida de efectivo en la caja ABIERTA (aparte de
   * ventas). Ajusta el efectivo esperado al cierre. Queda en bitácora.
   */
  async addCashMovement(
    shiftId: string,
    input: CreateCashMovement,
    userId: string,
  ): Promise<CashMovement> {
    // Mismo criterio que el cobro (`assertPaymentParts`): solo medios del
    // catálogo habilitados. Sin esto, un typo por API ("NEQUI2") creaba el
    // movimiento y el cierre OBLIGABA a arquear un medio inexistente (§7.v20)
    // que no se podía quitar sin borrar el movimiento.
    const enabled = await this.paymentMethods.enabledSet();
    if (!enabled.has(input.method)) {
      throw new BadRequestException(
        `El medio de pago "${input.method}" no está habilitado. Revisa Medios de pago en el admin.`,
      );
    }
    // Tx SERIALIZABLE (auditoría 2026-07-05): el cierre lee los movimientos y
    // congela el esperado; un movimiento READ COMMITTED podía commitear ENTRE
    // ese cómputo y el CLOSED → plata fuera del arqueo. Serializable + re-check
    // del status dentro de la tx → SSI aborta a uno y el reintento ve la caja
    // ya cerrada (400 limpio).
    const row = await runWithSerializationRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const shift = await tx.shift.findUnique({
            where: { id: shiftId },
            select: { id: true, status: true },
          });
          if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
          if (shift.status !== 'OPEN') {
            throw new BadRequestException('Solo se registran movimientos en una caja abierta.');
          }
          return tx.cashMovement.create({
            data: {
              shiftId,
              type: input.type,
              method: input.method,
              amount: input.amount,
              reason: input.reason,
              userId,
            },
            include: { user: { select: { fullName: true } } },
          });
        },
        { isolationLevel: 'Serializable', timeout: 10_000 },
      ),
    );
    await this.audit.log({
      userId,
      action: input.type === 'IN' ? 'CASH_MOVEMENT_IN' : 'CASH_MOVEMENT_OUT',
      entityType: 'shift',
      entityId: shiftId,
      metadata: { amount: input.amount, reason: input.reason, method: input.method },
    });
    return toCashMovementDto(row);
  }

  /**
   * Corrige un movimiento mal registrado. Solo con la caja ABIERTA — un
   * arqueo cerrado es histórico inmutable. Queda en bitácora con el
   * antes/después para que el cambio sea auditable.
   */
  async updateCashMovement(
    shiftId: string,
    movementId: string,
    input: CreateCashMovement,
    userId: string,
  ): Promise<CashMovement> {
    // Serializable por la misma razón que addCashMovement: no editar un
    // movimiento ENTRE el cómputo del esperado y el CLOSED del cierre.
    const { before, row } = await runWithSerializationRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const prev = await this.findOpenShiftMovement(shiftId, movementId, tx);
          const updated = await tx.cashMovement.update({
            where: { id: movementId },
            data: {
              type: input.type,
              method: input.method,
              amount: input.amount,
              reason: input.reason,
            },
            include: { user: { select: { fullName: true } } },
          });
          return { before: prev, row: updated };
        },
        { isolationLevel: 'Serializable', timeout: 10_000 },
      ),
    );
    await this.audit.log({
      userId,
      action: 'CASH_MOVEMENT_UPDATED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: {
        movementId,
        before: {
          type: before.type,
          method: before.method,
          amount: Number(before.amount),
          reason: before.reason,
        },
        after: {
          type: input.type,
          method: input.method,
          amount: input.amount,
          reason: input.reason,
        },
      },
    });
    return toCashMovementDto(row);
  }

  /** Elimina un movimiento mal registrado. Solo con la caja ABIERTA. */
  async deleteCashMovement(
    shiftId: string,
    movementId: string,
    userId: string,
  ): Promise<void> {
    const before = await runWithSerializationRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const prev = await this.findOpenShiftMovement(shiftId, movementId, tx);
          await tx.cashMovement.delete({ where: { id: movementId } });
          return prev;
        },
        { isolationLevel: 'Serializable', timeout: 10_000 },
      ),
    );
    await this.audit.log({
      userId,
      action: 'CASH_MOVEMENT_DELETED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: {
        movementId,
        type: before.type,
        method: before.method,
        amount: Number(before.amount),
        reason: before.reason,
      },
    });
  }

  /** El movimiento existe, pertenece a esa caja y la caja sigue OPEN. */
  private async findOpenShiftMovement(
    shiftId: string,
    movementId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const row = await db.cashMovement.findUnique({
      where: { id: movementId },
      include: { shift: { select: { status: true } } },
    });
    if (!row || row.shiftId !== shiftId) {
      throw new NotFoundException(`Movimiento ${movementId} no encontrado en esta caja`);
    }
    if (row.shift.status !== 'OPEN') {
      throw new BadRequestException(
        'La caja ya está cerrada — el arqueo es inmutable. Pídele a un admin que la reabra si hay un error.',
      );
    }
    return row;
  }

  async listCashMovements(shiftId: string): Promise<CashMovement[]> {
    const rows = await this.prisma.cashMovement.findMany({
      where: { shiftId },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCashMovementDto);
  }

  /**
   * `from`/`to` acotan por `openedAt` (la caja pertenece al día en que ABRIÓ,
   * aunque cierre de madrugada). `to` es EXCLUSIVO — el controller le suma el
   * día para incluir la jornada completa. Ambos opcionales: sin ellos el
   * listado no filtra por fecha (comportamiento previo intacto).
   */
  async list(
    filter: {
      cashierId?: string;
      status?: ShiftStatus;
      limit?: number;
      from?: Date;
      to?: Date;
    } = {},
  ): Promise<Shift[]> {
    const where: Prisma.ShiftWhereInput = {};
    if (filter.cashierId) where.cashierId = filter.cashierId;
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
      where.openedAt = {};
      if (filter.from) where.openedAt.gte = filter.from;
      if (filter.to) where.openedAt.lt = filter.to;
    }
    const rows = await this.prisma.shift.findMany({
      where,
      include: { cashier: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
      take: filter.limit ?? 50,
    });
    return rows.map(toShiftDto);
  }
}

type DbCashMovement = Prisma.CashMovementGetPayload<{
  include: { user: { select: { fullName: true } } };
}>;

function toCashMovementDto(row: DbCashMovement): CashMovement {
  return {
    id: row.id,
    shiftId: row.shiftId,
    type: row.type,
    method: row.method,
    amount: Number(row.amount),
    reason: row.reason,
    userId: row.userId,
    userName: row.user?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Descuadre de la cuenta: suma de las diferencias por método arqueado. */
function sumDigitalDifference(lines: DigitalCountLine[]): number {
  return lines.reduce((acc, d) => acc + (d.difference ?? 0), 0);
}

/** "+$1.000" / "-$25.000" / "$0" para los mensajes de novedad. */
function signedCop(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return '$0';
  return `${rounded > 0 ? '+' : '-'}$${Math.abs(rounded).toLocaleString('es-CO')}`;
}

/** Fecha legible (DD/MM/YYYY HH:mm) en hora local del server, para mensajes. */
function formatOpenedAt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toShiftDto(row: DbShiftWithCashier): Shift {
  return {
    id: row.id,
    cashierId: row.cashierId,
    cashierName: row.cashier?.fullName ?? null,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    openingCash: Number(row.openingCash),
    expectedCash: row.expectedCash !== null ? Number(row.expectedCash) : null,
    countedCash: row.countedCash !== null ? Number(row.countedCash) : null,
    difference: row.difference !== null ? Number(row.difference) : null,
    notes: row.notes,
    status: row.status,
    cashCountBreakdown: (row.cashCountBreakdown as CashCountLine[] | null) ?? null,
    digitalCountBreakdown: (row.digitalCountBreakdown as DigitalCountLine[] | null) ?? null,
    tipsCollected: row.tipsCollected !== null ? Number(row.tipsCollected) : null,
  };
}

