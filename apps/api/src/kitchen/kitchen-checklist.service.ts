import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChecklistDay,
  ChecklistItem,
  ChecklistType,
  CompleteChecklist,
  CreateChecklistItem,
  MarkChecklistItem,
  UpdateChecklistItem,
} from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { ymdLocal } from '../common/local-dates';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { buildChecklistDay, listDaysDesc, type DbCompletion, type DbMark } from './checklist-day';

/** Tope del histórico por consulta (~3 meses). */
const MAX_HISTORY_DAYS = 92;

/** Día local YYYY-MM-DD. El checklist va por día CALENDARIO, no de negocio
 *  (§7.v14): la rutina de cierre de cocina pertenece al día que se cerró. */
function todayLocal(): string {
  return ymdLocal(new Date());
}

/**
 * Checklist de apertura/cierre de cocina. El admin/dueño administra las tareas;
 * el cocinero las marca de a una y el marcado se guarda al instante.
 *
 * Cada marca deja autor y hora (`checklist_marks`), que es lo que permite
 * responder "quién hizo qué" y —sobre todo— "qué NO se hizo": antes solo se
 * guardaba la rutina 100% completa, así que un día a medias era indistinguible
 * de un día en que nadie abrió la app.
 */
@Injectable()
export class KitchenChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  getToday(type: ChecklistType): Promise<ChecklistDay> {
    return this.getDay(type, todayLocal());
  }

  /** Estado de una rutina en un día: tareas esperadas, marcadas y por quién. */
  async getDay(type: ChecklistType, day: string): Promise<ChecklistDay> {
    const [items, marks, completion] = await Promise.all([
      this.prisma.checklistItem.findMany({
        where: { type },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.checklistMark.findMany({ where: { type, day } }),
      this.prisma.checklistCompletion.findUnique({ where: { type_day: { type, day } } }),
    ]);
    const names = await this.resolveNames(marks, completion ? [completion] : []);
    return buildChecklistDay({ type, day, items, marks, completion, names });
  }

  /** Marca o desmarca UNA tarea de la rutina de hoy. Idempotente. */
  async markItem(input: MarkChecklistItem, userId: string): Promise<ChecklistDay> {
    const item = await this.prisma.checklistItem.findUnique({ where: { id: input.itemId } });
    if (!item || item.type !== input.type) {
      throw new NotFoundException('Esa tarea no existe en esta rutina.');
    }
    if (!item.isActive) {
      throw new BadRequestException('Esa tarea ya no está en la rutina.');
    }
    const day = todayLocal();
    if (input.done) {
      // El autor NO se pisa si ya estaba marcada: interesa quién la hizo.
      await this.prisma.checklistMark.upsert({
        where: { type_day_itemId: { type: input.type, day, itemId: input.itemId } },
        create: { type: input.type, day, itemId: input.itemId, doneById: userId },
        update: {},
      });
    } else {
      await this.prisma.checklistMark.deleteMany({
        where: { type: input.type, day, itemId: input.itemId },
      });
      // Desmarcar deja la rutina incompleta: el cierre de hoy deja de valer.
      // Si no, el día quedaría "cerrado" con una tarea pendiente.
      await this.prisma.checklistCompletion.deleteMany({ where: { type: input.type, day } });
    }
    return this.getDay(input.type, day);
  }

  /** Cierra la rutina de hoy. Exige que TODAS las tareas activas estén marcadas. */
  async complete(input: CompleteChecklist, userId: string): Promise<ChecklistDay> {
    const day = todayLocal();
    const [active, marks] = await Promise.all([
      this.prisma.checklistItem.findMany({
        where: { type: input.type, isActive: true },
        select: { id: true },
      }),
      this.prisma.checklistMark.findMany({
        where: { type: input.type, day },
        select: { itemId: true },
      }),
    ]);
    if (active.length === 0) {
      throw new BadRequestException('No hay tareas configuradas para esta rutina.');
    }
    const done = new Set(marks.map((m) => m.itemId));
    const missing = active.filter((i) => !done.has(i.id)).length;
    if (missing > 0) {
      throw new BadRequestException(
        missing === 1
          ? 'Falta una tarea por marcar antes de cerrar la rutina.'
          : `Faltan ${missing} tareas por marcar antes de cerrar la rutina.`,
      );
    }
    await this.prisma.checklistCompletion.upsert({
      where: { type_day: { type: input.type, day } },
      create: { type: input.type, day, doneItemIds: [...done], completedById: userId },
      update: { doneItemIds: [...done], completedById: userId, updatedAt: new Date() },
    });
    await this.audit.log({
      userId,
      action: 'KITCHEN_CHECKLIST_COMPLETED',
      entityType: 'checklist',
      entityId: `${input.type}:${day}`,
      metadata: { type: input.type, items: done.size },
    });
    return this.getDay(input.type, day);
  }

  /**
   * Histórico para el dueño: cada día del rango con sus dos rutinas, incluidos
   * los días en que NO se hizo nada — que es justamente lo que quiere ver.
   */
  async history(from: string, to: string): Promise<ChecklistDay[]> {
    const days = listDaysDesc(from, to, MAX_HISTORY_DAYS);
    const [items, marks, completions] = await Promise.all([
      this.prisma.checklistItem.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.checklistMark.findMany({ where: { day: { in: days } } }),
      this.prisma.checklistCompletion.findMany({ where: { day: { in: days } } }),
    ]);
    const names = await this.resolveNames(marks, completions);

    const marksByKey = groupBy(marks, (m) => `${m.type}:${m.day}`);
    const completionByKey = new Map(completions.map((c) => [`${c.type}:${c.day}`, c]));
    const itemsByType = groupBy(items, (i) => i.type);

    const out: ChecklistDay[] = [];
    for (const day of days) {
      for (const type of ['OPEN', 'CLOSE'] as ChecklistType[]) {
        out.push(
          buildChecklistDay({
            type,
            day,
            items: itemsByType.get(type) ?? [],
            marks: marksByKey.get(`${type}:${day}`) ?? [],
            completion: completionByKey.get(`${type}:${day}`) ?? null,
            names,
          }),
        );
      }
    }
    return out;
  }

  // ── Admin: administrar tareas ─────────────────────────────────────

  async listItems(type?: ChecklistType): Promise<ChecklistItem[]> {
    const rows = await this.prisma.checklistItem.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((i) => this.toItemDto(i));
  }

  async createItem(input: CreateChecklistItem, userId: string): Promise<ChecklistItem> {
    const row = await this.prisma.checklistItem.create({
      data: { type: input.type, label: input.label, sortOrder: input.sortOrder },
    });
    await this.audit.log({
      userId,
      action: 'CHECKLIST_ITEM_CREATED',
      entityType: 'checklist_item',
      entityId: row.id,
      metadata: { type: input.type, label: input.label },
    });
    return this.toItemDto(row);
  }

  async updateItem(id: string, input: UpdateChecklistItem, userId: string): Promise<ChecklistItem> {
    const row = await this.prisma.checklistItem.update({
      where: { id },
      data: {
        label: input.label ?? undefined,
        sortOrder: input.sortOrder ?? undefined,
        isActive: input.isActive ?? undefined,
      },
    });
    await this.audit.log({
      userId,
      action: 'CHECKLIST_ITEM_UPDATED',
      entityType: 'checklist_item',
      entityId: id,
      metadata: { ...input },
    });
    return this.toItemDto(row);
  }

  /** Nombres de todos los autores en UNA consulta (nunca uno por fila). */
  private resolveNames(marks: DbMark[], completions: DbCompletion[]): Promise<Map<string, string>> {
    return this.users.namesByIds([
      ...marks.map((m) => m.doneById),
      ...completions.map((c) => c.completedById),
    ]);
  }

  private toItemDto(row: {
    id: string;
    type: ChecklistType;
    label: string;
    sortOrder: number;
    isActive: boolean;
  }): ChecklistItem {
    return {
      id: row.id,
      type: row.type,
      label: row.label,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    };
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}
