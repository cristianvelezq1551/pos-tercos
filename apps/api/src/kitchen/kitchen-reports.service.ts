import { Injectable } from '@nestjs/common';
import { PRODUCTION_REVERSAL_SOURCE_TYPE } from '@pos-tercos/domain';
import type {
  KitchenActivityDay,
  KitchenProductionRun,
  KitchenWasteEntry,
} from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';
import { CogsService } from '../reports/cogs.service';
import { UsersService } from '../users/users.service';
import { KitchenChecklistService } from './kitchen-checklist.service';
import { listDaysDesc } from './checklist-day';
import {
  buildActivityDays,
  toProductionRun,
  toWasteEntry,
  type ProductionHeaderRow,
  type ProductionInputRow,
  type WasteRow,
} from './kitchen-reports.mappers';

/** Tope de filas por consulta. */
const MAX_ROWS = 300;
const MAX_ACTIVITY_DAYS = 92;

export interface KitchenRangeFilter {
  from: Date;
  to: Date;
  userId?: string;
}

/**
 * Lecturas de cocina para el dueño: qué se produjo, qué se tiró y qué hizo cada
 * persona. Solo lectura — cross-dominio a propósito (movimientos, incidencias,
 * checklist y costo FIFO en una pasada), como los agregadores de reportes.
 */
@Injectable()
export class KitchenReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly cogs: CogsService,
    private readonly checklist: KitchenChecklistService,
  ) {}

  /**
   * Tandas de producción, agrupadas por tanda y no por movimiento: una tanda
   * escribe una entrada y N consumos, y verlos sueltos no le dice nada a nadie.
   */
  async listProductions(f: KitchenRangeFilter): Promise<KitchenProductionRun[]> {
    // Los encabezados se acotan PRIMERO: limitar sobre el total partiría una
    // tanda al medio (entrada adentro del tope, consumos afuera).
    const headers = (await this.prisma.inventoryMovement.findMany({
      where: {
        sourceType: 'production',
        delta: { gt: 0 },
        createdAt: { gte: f.from, lte: f.to },
        ...(f.userId ? { userId: f.userId } : {}),
      },
      include: {
        subproduct: { select: { name: true, unit: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    })) as ProductionHeaderRow[];

    const runIds = headers.map((h) => h.sourceId).filter((id): id is string => id !== null);
    if (runIds.length === 0) return [];

    const inputs = (await this.prisma.inventoryMovement.findMany({
      where: { sourceType: 'production', sourceId: { in: runIds }, delta: { lt: 0 } },
      include: {
        ingredient: { select: { name: true, unitRecipe: true } },
        product: { select: { name: true, unitStock: true } },
        subproduct: { select: { name: true, unit: true } },
      },
    })) as ProductionInputRow[];

    const inputsByRun = new Map<string, ProductionInputRow[]>();
    for (const row of inputs) {
      const bucket = inputsByRun.get(row.sourceId ?? '');
      if (bucket) bucket.push(row);
      else inputsByRun.set(row.sourceId ?? '', [row]);
    }

    // Tandas anuladas: siguen en la lista —el registro existió— pero marcadas.
    // Sin esto, una tanda deshecha se leería como vigente y el dueño sacaría
    // conclusiones sobre producción que no ocurrió.
    const anulaciones = await this.prisma.inventoryMovement.findMany({
      where: {
        sourceType: PRODUCTION_REVERSAL_SOURCE_TYPE,
        sourceId: { in: runIds },
        delta: { lt: 0 },
        entityType: 'SUBPRODUCT',
      },
      select: { sourceId: true, createdAt: true, notes: true, user: { select: { fullName: true } } },
    });
    const anuladaPorRun = new Map(anulaciones.map((a) => [a.sourceId ?? '', a]));

    return headers.map((h) =>
      toProductionRun(
        h,
        inputsByRun.get(h.sourceId ?? '') ?? [],
        anuladaPorRun.get(h.sourceId ?? '') ?? null,
      ),
    );
  }

  /** Mermas del rango con su costo real y cuánto se anuló de cada una. */
  async listWaste(f: KitchenRangeFilter): Promise<KitchenWasteEntry[]> {
    const rows = (await this.prisma.inventoryMovement.findMany({
      where: {
        type: 'WASTE',
        createdAt: { gte: f.from, lte: f.to },
        ...(f.userId ? { userId: f.userId } : {}),
      },
      include: {
        ingredient: { select: { name: true, unitRecipe: true } },
        product: { select: { name: true, unitStock: true } },
        subproduct: { select: { name: true, unit: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    })) as WasteRow[];
    if (rows.length === 0) return [];

    const [reversals, costs] = await Promise.all([
      this.prisma.inventoryMovement.groupBy({
        by: ['sourceId'],
        where: { sourceType: 'waste_reversal', sourceId: { in: rows.map((r) => r.id) } },
        _sum: { delta: true },
      }),
      this.cogs.getWasteCostByMovement(f.from),
    ]);
    const reversedById = new Map(
      reversals.map((r) => [r.sourceId ?? '', Number(r._sum.delta ?? 0)]),
    );
    return rows.map((r) => toWasteEntry(r, reversedById.get(r.id) ?? 0, costs.get(r.id) ?? null));
  }

  /** Ids de las tandas anuladas cuyo movimiento cae en el rango. */
  private async tandasAnuladasEn(range: { gte: Date; lte: Date }): Promise<string[]> {
    const filas = await this.prisma.inventoryMovement.findMany({
      where: { sourceType: PRODUCTION_REVERSAL_SOURCE_TYPE, createdAt: range },
      select: { sourceId: true },
      distinct: ['sourceId'],
    });
    return filas.map((f) => f.sourceId).filter((id): id is string => id !== null);
  }

  /** Resumen por día: rutinas, producción, merma, incidencias y quién hizo qué. */
  async activity(from: string, to: string): Promise<KitchenActivityDay[]> {
    const days = listDaysDesc(from, to, MAX_ACTIVITY_DAYS);
    const range = { gte: startOfDay(days[days.length - 1]), lte: endOfDay(days[0]) };

    // Las tandas anuladas quedan FUERA del resumen del día: contarlas diría que
    // se produjo algo que se deshizo, e inflaría el trabajo de quien la
    // registró. La tanda igual se ve, con su marca, en la pestaña de Producción.
    const anuladas = await this.tandasAnuladasEn(range);

    const [productions, wastes, incidents, marks, checklistDays] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where: {
          sourceType: 'production',
          delta: { gt: 0 },
          createdAt: range,
          ...(anuladas.length > 0 ? { sourceId: { notIn: anuladas } } : {}),
        },
        select: { userId: true, delta: true, createdAt: true },
      }),
      this.prisma.inventoryMovement.findMany({
        where: { type: 'WASTE', createdAt: range },
        select: { id: true, userId: true, createdAt: true },
      }),
      this.prisma.kitchenIncident.findMany({
        where: { createdAt: range },
        select: { authorId: true, createdAt: true },
      }),
      this.prisma.checklistMark.findMany({
        where: { day: { in: days } },
        select: { day: true, doneById: true },
      }),
      this.checklist.history(from, to),
    ]);

    const costs = await this.cogs.getWasteCostByMovement(range.gte);
    const names = await this.users.namesByIds([
      ...productions.map((p) => p.userId ?? ''),
      ...wastes.map((w) => w.userId ?? ''),
      ...incidents.map((i) => i.authorId),
      ...marks.map((m) => m.doneById),
    ]);
    return buildActivityDays({
      days,
      productions,
      wastes,
      incidents,
      marks,
      checklistDays,
      costs,
      names,
    });
  }
}

/** Medianoche local del día (los movimientos son timestamps, no fecha-solo). */
function startOfDay(day: string): Date {
  return new Date(`${day}T00:00:00`);
}
function endOfDay(day: string): Date {
  return new Date(`${day}T23:59:59.999`);
}
