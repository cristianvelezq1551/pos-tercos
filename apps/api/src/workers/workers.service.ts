import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CheckIn,
  CheckOut,
  CreateCommission,
  PayrollPeriodEntry,
  PayrollPeriodReport,
  WorkerAttendance,
  WorkerCommission,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type DbAttendanceWithUser = Prisma.WorkerAttendanceGetPayload<{
  include: { user: { select: { fullName: true; role: true } } };
}>;
type DbCommissionWithUser = Prisma.WorkerCommissionGetPayload<{
  include: { user: { select: { fullName: true } } };
}>;

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==================================================================
  // ATTENDANCE
  // ==================================================================

  /**
   * Registra entrada del trabajador. Si ya hay un turno abierto
   * (checkOut null) lanza 400 — primero hay que cerrarlo. Esto previene
   * dobles check-in accidentales.
   */
  async checkIn(
    userId: string,
    input: CheckIn,
    actorUserId: string,
  ): Promise<WorkerAttendance> {
    await this.assertUserExists(userId);
    const open = await this.prisma.workerAttendance.findFirst({
      where: { userId, checkOut: null },
      select: { id: true, checkIn: true },
    });
    if (open) {
      throw new BadRequestException(
        `Trabajador ya tiene un turno abierto desde ${open.checkIn.toISOString()}. Cerralo antes de un nuevo check-in.`,
      );
    }
    const checkIn = input.at ? new Date(input.at) : new Date();

    const created = await this.prisma.workerAttendance.create({
      data: {
        userId,
        checkIn,
        notes: input.notes ?? null,
      },
      include: includeAttendance(),
    });

    await this.audit.log({
      userId: actorUserId,
      action: 'WORKER_CHECK_IN',
      entityType: 'worker_attendance',
      entityId: created.id,
      metadata: { workerId: userId, checkIn: checkIn.toISOString() },
    });

    return toAttendanceDto(created);
  }

  /**
   * Cierra un turno abierto. Calcula horas trabajadas decimales.
   */
  async checkOut(
    attendanceId: string,
    input: CheckOut,
    actorUserId: string,
  ): Promise<WorkerAttendance> {
    const existing = await this.prisma.workerAttendance.findUnique({
      where: { id: attendanceId },
    });
    if (!existing) {
      throw new NotFoundException(`Attendance ${attendanceId} no encontrado`);
    }
    if (existing.checkOut !== null) {
      throw new BadRequestException(
        `Attendance ${attendanceId} ya tiene check-out (${existing.checkOut.toISOString()})`,
      );
    }
    const checkOut = input.at ? new Date(input.at) : new Date();
    if (checkOut <= existing.checkIn) {
      throw new BadRequestException(
        'check-out debe ser posterior a check-in',
      );
    }
    const hoursWorked = roundHours(
      (checkOut.getTime() - existing.checkIn.getTime()) / 3_600_000,
    );

    const updated = await this.prisma.workerAttendance.update({
      where: { id: attendanceId },
      data: {
        checkOut,
        hoursWorked,
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: includeAttendance(),
    });

    await this.audit.log({
      userId: actorUserId,
      action: 'WORKER_CHECK_OUT',
      entityType: 'worker_attendance',
      entityId: attendanceId,
      metadata: {
        workerId: existing.userId,
        hoursWorked,
        checkOut: checkOut.toISOString(),
      },
    });

    return toAttendanceDto(updated);
  }

  async listAttendance(opts: {
    userId?: string;
    from?: Date;
    to?: Date;
    onlyOpen?: boolean;
    limit?: number;
  }): Promise<WorkerAttendance[]> {
    const where: Prisma.WorkerAttendanceWhereInput = {};
    if (opts.userId) where.userId = opts.userId;
    if (opts.onlyOpen) where.checkOut = null;
    if (opts.from || opts.to) {
      where.checkIn = {};
      if (opts.from) where.checkIn.gte = opts.from;
      if (opts.to) where.checkIn.lte = opts.to;
    }
    const rows = await this.prisma.workerAttendance.findMany({
      where,
      include: includeAttendance(),
      orderBy: { checkIn: 'desc' },
      take: opts.limit ?? 200,
    });
    return rows.map(toAttendanceDto);
  }

  // ==================================================================
  // COMMISSIONS
  // ==================================================================

  /** Crea una NUEVA comisión (histórico inmutable; nunca update). */
  async createCommission(
    userId: string,
    input: CreateCommission,
    actorUserId: string,
  ): Promise<WorkerCommission> {
    await this.assertUserExists(userId);

    const created = await this.prisma.workerCommission.create({
      data: {
        userId,
        type: input.type,
        percent: input.percent ?? null,
        fixedAmount: input.fixedAmount ?? null,
        appliedAt: input.appliedAt ? new Date(input.appliedAt) : new Date(),
        notes: input.notes ?? null,
      },
      include: includeCommission(),
    });

    await this.audit.log({
      userId: actorUserId,
      action: 'WORKER_COMMISSION_CREATED',
      entityType: 'worker_commission',
      entityId: created.id,
      metadata: {
        workerId: userId,
        type: input.type,
        percent: input.percent ?? null,
        fixedAmount: input.fixedAmount ?? null,
      },
    });

    return toCommissionDto(created);
  }

  async listCommissions(userId?: string): Promise<WorkerCommission[]> {
    const where: Prisma.WorkerCommissionWhereInput = {};
    if (userId) where.userId = userId;
    const rows = await this.prisma.workerCommission.findMany({
      where,
      include: includeCommission(),
      orderBy: { appliedAt: 'desc' },
      take: 200,
    });
    return rows.map(toCommissionDto);
  }

  /** Devuelve la comisión vigente para un user en una fecha dada. */
  async getActiveCommission(
    userId: string,
    at: Date,
  ): Promise<WorkerCommission | null> {
    const row = await this.prisma.workerCommission.findFirst({
      where: { userId, appliedAt: { lte: at } },
      include: includeCommission(),
      orderBy: { appliedAt: 'desc' },
    });
    return row ? toCommissionDto(row) : null;
  }

  // ==================================================================
  // PAYROLL PERIOD
  // ==================================================================

  async getPayrollPeriod(from: Date, to: Date): Promise<PayrollPeriodReport> {
    // Trabajadores activos con asistencia en el rango.
    const attendances = await this.prisma.workerAttendance.findMany({
      where: { checkIn: { gte: from, lte: to } },
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });

    // Agrupar por user.
    type Acc = {
      userId: string;
      userFullName: string;
      userRole: string;
      totalHours: number;
      attendanceDays: Set<string>;
    };
    const byUser = new Map<string, Acc>();
    for (const a of attendances) {
      const key = a.userId;
      const acc =
        byUser.get(key) ??
        ({
          userId: a.userId,
          userFullName: a.user.fullName,
          userRole: a.user.role,
          totalHours: 0,
          attendanceDays: new Set<string>(),
        } satisfies Acc);
      if (a.hoursWorked !== null) {
        acc.totalHours += Number(a.hoursWorked);
      }
      acc.attendanceDays.add(toDayBucket(a.checkIn));
      byUser.set(key, acc);
    }

    const entries: PayrollPeriodEntry[] = [];
    for (const acc of byUser.values()) {
      const activeCommission = await this.getActiveCommission(acc.userId, to);
      let estimatedCommission = 0;

      if (activeCommission && acc.userRole === 'CAJERO') {
        if (activeCommission.type === 'PERCENT_OF_SHIFT' && activeCommission.percent) {
          // Sum revenue de shifts cerrados del cajero en el período.
          const shifts = await this.prisma.shift.findMany({
            where: {
              cashierId: acc.userId,
              status: { in: ['CLOSED', 'RECONCILED'] },
              openedAt: { gte: from, lte: to },
            },
            select: { id: true },
          });
          if (shifts.length > 0) {
            const sales = await this.prisma.sale.aggregate({
              where: {
                shiftId: { in: shifts.map((s) => s.id) },
                paidAt: { not: null },
                status: {
                  notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'],
                },
              },
              _sum: { total: true },
            });
            const revenue = Number(sales._sum.total ?? 0);
            estimatedCommission = revenue * activeCommission.percent;
          }
        } else if (
          activeCommission.type === 'FIXED_PER_SALE' &&
          activeCommission.fixedAmount
        ) {
          const saleCount = await this.prisma.sale.count({
            where: {
              cashierId: acc.userId,
              paidAt: { gte: from, lte: to },
              status: {
                notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'],
              },
            },
          });
          estimatedCommission = saleCount * activeCommission.fixedAmount;
        }
      }

      entries.push({
        userId: acc.userId,
        userFullName: acc.userFullName,
        userRole: acc.userRole,
        totalHours: roundHours(acc.totalHours),
        attendanceDays: acc.attendanceDays.size,
        activeCommission,
        estimatedCommission: Math.round(estimatedCommission * 100) / 100,
      });
    }

    entries.sort((a, b) => b.totalHours - a.totalHours);

    return {
      periodFrom: toDayBucket(from),
      periodTo: toDayBucket(to),
      entries,
    };
  }

  // ==================================================================
  // HELPERS
  // ==================================================================

  private async assertUserExists(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true },
    });
    if (!u) throw new NotFoundException(`User ${userId} no encontrado`);
    if (!u.active) {
      throw new BadRequestException(`User ${userId} está inactivo`);
    }
  }
}

// ====================================================================
// HELPERS DE FORMATEO
// ====================================================================

function includeAttendance() {
  return {
    user: { select: { fullName: true, role: true } },
  } satisfies Prisma.WorkerAttendanceInclude;
}

function includeCommission() {
  return {
    user: { select: { fullName: true } },
  } satisfies Prisma.WorkerCommissionInclude;
}

function toAttendanceDto(row: DbAttendanceWithUser): WorkerAttendance {
  return {
    id: row.id,
    userId: row.userId,
    userFullName: row.user.fullName,
    userRole: row.user.role,
    checkIn: row.checkIn.toISOString(),
    checkOut: row.checkOut ? row.checkOut.toISOString() : null,
    hoursWorked: row.hoursWorked === null ? null : Number(row.hoursWorked),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCommissionDto(row: DbCommissionWithUser): WorkerCommission {
  return {
    id: row.id,
    userId: row.userId,
    userFullName: row.user.fullName,
    type: row.type,
    percent: row.percent === null ? null : Number(row.percent),
    fixedAmount: row.fixedAmount === null ? null : Number(row.fixedAmount),
    appliedAt: row.appliedAt.toISOString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDayBucket(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
