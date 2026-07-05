import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateKitchenIncident, KitchenIncident } from '@pos-tercos/types';
import type { KitchenIncident as DbKitchenIncident } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/**
 * Bitácora de incidencias: el cocinero deja notas para el dueño (insumo en mal
 * estado, equipo, tanda perdida…). El dueño/admin las lee y puede marcarlas
 * como resueltas. Todo auditado.
 */
@Injectable()
export class KitchenIncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async create(input: CreateKitchenIncident, userId: string): Promise<KitchenIncident> {
    const row = await this.prisma.kitchenIncident.create({
      data: { category: input.category, note: input.note, authorId: userId },
    });
    await this.audit.log({
      userId,
      action: 'KITCHEN_INCIDENT_LOGGED',
      entityType: 'kitchen_incident',
      entityId: row.id,
      metadata: { category: input.category },
    });
    return this.toDto(row, await this.users.namesByIds([row.authorId]));
  }

  /** Lista incidencias (recientes primero). `onlyOpen` filtra las no resueltas. */
  async list(opts: { onlyOpen?: boolean; limit?: number } = {}): Promise<KitchenIncident[]> {
    const rows = await this.prisma.kitchenIncident.findMany({
      where: opts.onlyOpen ? { resolvedAt: null } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 100, 300),
    });
    const names = await this.users.namesByIds(rows.flatMap((r) => [r.authorId, r.resolvedById ?? '']));
    return rows.map((r) => this.toDto(r, names));
  }

  /** Marca una incidencia como resuelta (admin/dueño). Idempotente: si ya estaba, no la pisa. */
  async resolve(id: string, userId: string): Promise<KitchenIncident> {
    const existing = await this.prisma.kitchenIncident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Incidencia ${id} no encontrada`);
    if (existing.resolvedAt) {
      throw new BadRequestException('La incidencia ya estaba resuelta.');
    }
    const row = await this.prisma.kitchenIncident.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: userId },
    });
    await this.audit.log({
      userId,
      action: 'KITCHEN_INCIDENT_RESOLVED',
      entityType: 'kitchen_incident',
      entityId: id,
    });
    return this.toDto(row, await this.users.namesByIds([row.authorId, row.resolvedById ?? '']));
  }

  private toDto(row: DbKitchenIncident, names: Map<string, string>): KitchenIncident {
    return {
      id: row.id,
      category: row.category,
      note: row.note,
      authorId: row.authorId,
      authorName: names.get(row.authorId) ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedById: row.resolvedById,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
