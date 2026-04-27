import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OpenShift, Shift, ShiftStatus } from '@pos-tercos/types';
import type { Prisma, Shift as DbShift } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

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

// Suprimir warning de helper sin uso (silencia warnings genéricos)
export type { DbShift };
