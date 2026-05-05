import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildDiscrepancyAlertLink } from '@pos-tercos/domain';
import type { CloseShift, OpenShift, Shift, ShiftStatus } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
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
  ) {}

  /**
   * Abre un turno para `cashierId`. Si ya hay uno OPEN, conflict.
   *
   * Razón de no permitir múltiples OPEN: el flujo de caja exige
   * 1 turno por cajero a la vez. Si necesita cambiar de caja, hay que
   * cerrar primero (FASE 11).
   */
  async open(input: OpenShift, cashierId: string): Promise<Shift> {
    const existing = await this.prisma.shift.findFirst({
      where: { cashierId, status: 'OPEN' },
      select: { id: true, openedAt: true },
    });
    if (existing) {
      throw new ConflictException(
        `Ya tenés un turno abierto (${existing.id}, abierto el ${existing.openedAt.toISOString()}). Cerralo antes de abrir uno nuevo.`,
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
   * Turno OPEN actual del cajero. Retorna null si no tiene.
   */
  async getCurrent(cashierId: string): Promise<Shift | null> {
    const row = await this.prisma.shift.findFirst({
      where: { cashierId, status: 'OPEN' },
      include: { cashier: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
    return row ? toShiftDto(row) : null;
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
   * FASE 11.A: cierre del turno. Calcula `expectedCash` desde apertura +
   * ventas CASH PAGADAS del turno; lo compara con `countedCash` declarado
   * por el cajero. Si |diff| >= DISCREPANCY_THRESHOLD_COP → audit
   * `SHIFT_DISCREPANCY_DETECTED` (en FASE 9 + WhatsApp se enviará alerta).
   *
   * Solo el cajero dueño del turno puede cerrarlo. El status pasa a CLOSED;
   * RECONCILED se reservará para FASE 11.E (post import CSV).
   */
  async close(shiftId: string, input: CloseShift, cashierId: string): Promise<Shift> {
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
    if (shift.cashierId !== cashierId) {
      throw new ForbiddenException('Solo el cajero dueño del turno puede cerrarlo.');
    }
    if (shift.status !== 'OPEN') {
      throw new BadRequestException(
        `Shift está en status ${shift.status}, ya no se puede cerrar.`,
      );
    }

    // Sumar todas las ventas PAGADAS con method=CASH del turno.
    const cashSales = await this.prisma.sale.aggregate({
      where: {
        shiftId,
        status: { in: ['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO', 'ENTREGADO'] },
        paymentMethod: 'CASH',
      },
      _sum: { total: true },
    });
    const cashSalesTotal = Number(cashSales._sum.total ?? 0);
    const expectedCash = Number(shift.openingCash) + cashSalesTotal;
    const difference = input.countedCash - expectedCash; // (+) sobrante, (-) faltante

    const closed = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        expectedCash,
        countedCash: input.countedCash,
        difference,
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
        expectedCash,
        countedCash: input.countedCash,
        difference,
      },
    });

    if (Math.abs(difference) >= DISCREPANCY_THRESHOLD_COP) {
      // FASE 15.A: pre-construimos el link wa.me al Dueño para que
      // pueda abrirlo desde el log de auditoría con un solo click. El
      // backend NO envía nada — solo deja la URL lista en metadata.
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
    }

    return toShiftDto(closed);
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

