import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, AuditLogEntry } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogInput {
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

interface ListFilter {
  userId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

type DbAuditLog = Prisma.AuditLogGetPayload<{
  include: { user: { select: { fullName: true; email: true } } };
}>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          beforeJson: (input.before ?? null) as Prisma.InputJsonValue,
          afterJson: (input.after ?? null) as Prisma.InputJsonValue,
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Audit failure must never break the calling business operation —
      // log and continue. Production should also forward this to Sentry.
      this.logger.error(`Failed to write audit log for ${input.action}`, err as Error);
    }
  }

  async list(filter: ListFilter = {}): Promise<AuditLogEntry[]> {
    const where: Prisma.AuditLogWhereInput = {};
    if (filter.userId) where.userId = filter.userId;
    if (filter.action) where.action = filter.action;
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.entityId) where.entityId = filter.entityId;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 200,
    });
    return rows.map(toAuditLogDto);
  }
}

function toAuditLogDto(row: DbAuditLog): AuditLogEntry {
  return {
    id: row.id,
    userId: row.userId,
    userFullName: row.user?.fullName ?? null,
    userEmail: row.user?.email ?? null,
    action: row.action as AuditLogEntry['action'],
    entityType: row.entityType,
    entityId: row.entityId,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
