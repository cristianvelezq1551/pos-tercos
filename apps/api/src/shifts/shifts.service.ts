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
  buildShiftCloseUserPrompt,
} from '@pos-tercos/domain';
import type {
  AiSummary,
  CashCountLine,
  CashMovement,
  CloseShift,
  CreateCashMovement,
  OpenShift,
  Shift,
  ShiftSessionDetail,
  ShiftStatus,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { LLMService } from '../adapters/llm/llm.service';
import { AuditService } from '../audit/audit.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Threshold de descuadre absoluto (COP) que dispara `SHIFT_DISCREPANCY_DETECTED`.
 * Por debajo de esto, la diferencia se registra pero no se considera anomalía.
 */
const DISCREPANCY_THRESHOLD_COP = 5_000;

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
      throw new BadRequestException('Cerrá la caja antes de analizarla con IA.');
    }

    const [cashSales, { cashIn, cashOut }, voidCount, noSaleDrawerCount] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: {
            shiftId,
            paymentMethod: 'CASH',
            status: {
              in: [
                'PAGADO',
                'EN_PREPARACION',
                'LISTO_DESPACHO',
                'ENTREGADO',
                'CANCELADO_SIN_REEMBOLSO',
              ],
            },
          },
          _sum: { total: true },
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
        cashSalesTotal: Math.round(Number(cashSales._sum.total ?? 0)),
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
    // ¿Ya hay una caja ABIERTA (de cualquiera)? → no se abre otra.
    const openAnywhere = await this.prisma.shift.findFirst({
      where: { status: 'OPEN' },
      select: { id: true, openedAt: true, cashier: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
    if (openAnywhere) {
      const who = openAnywhere.cashier?.fullName ?? 'otro usuario';
      const sameDay = openAnywhere.openedAt >= this.startOfToday();
      throw new ConflictException(
        sameDay
          ? `Ya hay una caja abierta por ${who}. Solo puede haber una caja abierta en el negocio.`
          : `Hay una caja abierta por ${who} desde ${formatOpenedAt(openAnywhere.openedAt)} (día anterior). Hay que cerrarla antes de abrir la de hoy.`,
      );
    }

    // UNA caja por día calendario: si hoy ya hubo una (cerrada), no se abre otra.
    // Si se cerró por error, el admin la reabre (no se crea una segunda).
    const startOfDay = this.startOfToday();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const todays = await this.prisma.shift.findFirst({
      where: { openedAt: { gte: startOfDay, lte: endOfDay } },
      select: { id: true },
    });
    if (todays) {
      throw new ConflictException(
        'La caja de hoy ya fue cerrada. No se abre una segunda el mismo día — si fue un error, pedí al admin que la reabra.',
      );
    }

    const created = await this.prisma.shift.create({
      data: {
        cashierId,
        openingCash: input.openingCash,
        notes: input.notes ?? null,
        status: 'OPEN',
      },
      include: { cashier: { select: { fullName: true } } },
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

  /** Inicio del día calendario local del server (TZ=America/Bogota en prod). */
  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Turno con el que el cajero puede operar HOY. Si dejó una caja OPEN de un
   * día anterior (nunca la cerró), lanza Conflict: debe cerrarla (Cerrar turno,
   * ingresando el efectivo con el que quedó) antes de seguir. Si no hay caja
   * OPEN, retorna null. Es el guard de "movimientos solo con la caja del día".
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
    if (row.openedAt < this.startOfToday()) {
      throw new ConflictException(
        `La caja sigue abierta desde el ${formatOpenedAt(row.openedAt)}. ` +
          `Cerrala (Cerrar turno) e ingresá el efectivo con el que quedó antes de seguir operando.`,
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
      stalePreviousDay: row.openedAt < this.startOfToday(),
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
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true, status: true, cashierId: true },
    });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    if (shift.status !== 'CLOSED') {
      throw new BadRequestException('Solo se reabre una caja CERRADA.');
    }
    const openElsewhere = await this.prisma.shift.findFirst({
      where: { cashierId: shift.cashierId, status: 'OPEN' },
      select: { id: true },
    });
    if (openElsewhere) {
      throw new ConflictException('El cajero ya tiene una caja abierta.');
    }
    const row = await this.prisma.shift.update({
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
    await this.audit.log({
      userId: adminId,
      action: 'SHIFT_REOPENED',
      entityType: 'shift',
      entityId: shiftId,
      metadata: { cashierId: shift.cashierId },
    });
    return toShiftDto(row);
  }

  /**
   * Detalle consolidado de una sesión/caja: datos de caja + resumen + todos
   * los pedidos del turno. Lo ve el cajero (la suya) y el admin (cualquiera).
   */
  async getSessionDetail(shiftId: string): Promise<ShiftSessionDetail> {
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
        turnNumber: true,
        type: true,
        status: true,
        total: true,
        paymentMethod: true,
        customerName: true,
        createdAt: true,
      },
    });

    const orders = rows.map((r) => ({
      id: r.id,
      receiptNumber: Number(r.receiptNumber),
      turnNumber: r.turnNumber,
      type: r.type,
      status: r.status,
      total: Number(r.total),
      paymentMethod: r.paymentMethod,
      customerName: r.customerName,
      createdAt: r.createdAt.toISOString(),
    }));

    const PAID = new Set(['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO', 'ENTREGADO']);
    const paid = orders.filter((o) => PAID.has(o.status));
    const byMethodMap = new Map<string, { count: number; total: number }>();
    const byTypeMap = new Map<string, { count: number; total: number }>();
    for (const o of paid) {
      const m = o.paymentMethod ?? 'N/D';
      const bm = byMethodMap.get(m) ?? { count: 0, total: 0 };
      byMethodMap.set(m, { count: bm.count + 1, total: bm.total + o.total });
      const bt = byTypeMap.get(o.type) ?? { count: 0, total: 0 };
      byTypeMap.set(o.type, { count: bt.count + 1, total: bt.total + o.total });
    }
    const sumBy = (method: string) =>
      paid.filter((o) => o.paymentMethod === method).reduce((a, o) => a + o.total, 0);

    return {
      shift,
      summary: {
        orderCount: orders.length,
        paidCount: paid.length,
        voidCount: orders.filter((o) => o.status === 'VOID').length,
        totalRevenue: paid.reduce((a, o) => a + o.total, 0),
        cashRevenue: sumBy('CASH'),
        transferRevenue: sumBy('TRANSFER'),
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

    // Efectivo que debe estar en el cajón: ventas CASH cuyo dinero se cobró y
    // NO se devolvió. Excluye VOID (reembolsado → neto 0) y CANCELADO_NO_PAGO
    // (nunca se pagó). Incluye CANCELADO_SIN_REEMBOLSO (el efectivo se quedó).
    const cashSales = await this.prisma.sale.aggregate({
      where: {
        shiftId,
        status: {
          in: [
            'PAGADO',
            'EN_PREPARACION',
            'LISTO_DESPACHO',
            'ENTREGADO',
            'CANCELADO_SIN_REEMBOLSO',
          ],
        },
        paymentMethod: 'CASH',
      },
      _sum: { total: true },
    });
    // COP son enteros; redondeamos para evitar cualquier drift Decimal→Number.
    const cashSalesTotal = Math.round(Number(cashSales._sum.total ?? 0));
    // Movimientos de efectivo del turno: entradas suman, salidas restan.
    const { cashIn, cashOut } = await this.sumCashMovements(shiftId);
    const expectedCash =
      Math.round(Number(shift.openingCash)) + cashSalesTotal + cashIn - cashOut;
    const difference = Math.round(input.countedCash) - expectedCash; // (+) sobrante, (-) faltante

    const closed = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        expectedCash,
        countedCash: input.countedCash,
        difference,
        cashCountBreakdown: input.breakdown ?? undefined,
        notes: input.notes ?? null,
      },
      include: { cashier: { select: { fullName: true } } },
    });

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
      },
    });

    if (Math.abs(difference) >= DISCREPANCY_THRESHOLD_COP) {
      // FASE 15.A: link wa.me en metadata para abrir desde /audit. Desde
      // 2026-06-10 además se ENVÍA directo al dueño vía OpenWA (abajo).
      const alertLink = buildDiscrepancyAlertLink({
        ownerPhone: process.env.OWNER_WHATSAPP_PHONE ?? null,
        cashierName: closed.cashier.fullName,
        difference,
        shiftId,
        closedAt: closed.closedAt ?? new Date(),
        businessName: process.env.BUSINESS_NAME ?? 'Tercos',
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
          whatsappAlertMessage: alertLink?.messagePlain ?? null,
        },
      });

      if (alertLink) {
        // Fire-and-forget: el cierre de caja no depende de WhatsApp.
        void this.ownerNotifications.alert('shift_discrepancy', alertLink.messagePlain, {
          shiftId,
          difference,
        });
      }
    }

    return toShiftDto(closed);
  }

  /** Suma de movimientos de efectivo del turno (entradas y salidas), en COP. */
  private async sumCashMovements(
    shiftId: string,
  ): Promise<{ cashIn: number; cashOut: number }> {
    const grouped = await this.prisma.cashMovement.groupBy({
      by: ['type'],
      where: { shiftId },
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
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true, status: true },
    });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('Solo se registran movimientos en una caja abierta.');
    }
    const row = await this.prisma.cashMovement.create({
      data: {
        shiftId,
        type: input.type,
        amount: input.amount,
        reason: input.reason,
        userId,
      },
      include: { user: { select: { fullName: true } } },
    });
    await this.audit.log({
      userId,
      action: input.type === 'IN' ? 'CASH_MOVEMENT_IN' : 'CASH_MOVEMENT_OUT',
      entityType: 'shift',
      entityId: shiftId,
      metadata: { amount: input.amount, reason: input.reason },
    });
    return toCashMovementDto(row);
  }

  async listCashMovements(shiftId: string): Promise<CashMovement[]> {
    const rows = await this.prisma.cashMovement.findMany({
      where: { shiftId },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCashMovementDto);
  }

  async list(filter: { cashierId?: string; status?: ShiftStatus; limit?: number } = {}): Promise<Shift[]> {
    const where: Prisma.ShiftWhereInput = {};
    if (filter.cashierId) where.cashierId = filter.cashierId;
    if (filter.status) where.status = filter.status;
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
    amount: Number(row.amount),
    reason: row.reason,
    userId: row.userId,
    userName: row.user?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
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
  };
}

