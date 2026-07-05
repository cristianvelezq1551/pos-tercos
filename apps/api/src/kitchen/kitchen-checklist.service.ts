import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ChecklistItem,
  ChecklistToday,
  ChecklistType,
  CompleteChecklist,
  CreateChecklistItem,
  UpdateChecklistItem,
} from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/** Día de negocio local (YYYY-MM-DD, TZ del server = America/Bogota). */
function localDay(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Checklist de apertura/cierre de cocina. El admin/dueño administra los ítems;
 * el cocinero los marca cada día. Una rutina (OPEN/CLOSE) se completa una vez
 * por día de negocio (único por type+day → re-completar hace upsert).
 */
@Injectable()
export class KitchenChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  /** Ítems activos del tipo + estado de la rutina de HOY (completada o no). */
  async getToday(type: ChecklistType): Promise<ChecklistToday> {
    const [items, completion] = await Promise.all([
      this.prisma.checklistItem.findMany({
        where: { type, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.checklistCompletion.findUnique({
        where: { type_day: { type, day: localDay() } },
      }),
    ]);
    const completedById = completion?.completedById ?? null;
    const names = completedById ? await this.users.namesByIds([completedById]) : new Map();
    return {
      type,
      items: items.map((i) => this.toItemDto(i)),
      completedAt: completion?.updatedAt.toISOString() ?? null,
      completedById,
      completedByName: completedById ? (names.get(completedById) ?? null) : null,
    };
  }

  /** Marca la rutina de hoy como completada. Exige cubrir TODOS los ítems activos. */
  async complete(input: CompleteChecklist, userId: string): Promise<ChecklistToday> {
    const active = await this.prisma.checklistItem.findMany({
      where: { type: input.type, isActive: true },
      select: { id: true },
    });
    if (active.length === 0) {
      throw new BadRequestException('No hay ítems configurados para esta rutina.');
    }
    const done = new Set(input.doneItemIds);
    const missing = active.filter((i) => !done.has(i.id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan ${missing.length} ítem(s) por marcar antes de cerrar la rutina.`,
      );
    }
    const day = localDay();
    await this.prisma.checklistCompletion.upsert({
      where: { type_day: { type: input.type, day } },
      create: { type: input.type, day, doneItemIds: input.doneItemIds, completedById: userId },
      update: { doneItemIds: input.doneItemIds, completedById: userId, updatedAt: new Date() },
    });
    await this.audit.log({
      userId,
      action: 'KITCHEN_CHECKLIST_COMPLETED',
      entityType: 'checklist',
      entityId: `${input.type}:${day}`,
      metadata: { type: input.type, items: input.doneItemIds.length },
    });
    return this.getToday(input.type);
  }

  // ── Admin: administrar ítems ──────────────────────────────────────

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
