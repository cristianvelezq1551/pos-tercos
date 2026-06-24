import { Injectable } from '@nestjs/common';
import type { BusinessConfig, UpdateBusinessConfig } from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const SINGLETON_ID = 'singleton';

/**
 * Config global del negocio (fila única). Hoy solo expone `monthStartDay`, el
 * día de corte del "mes del negocio" usado por el estado financiero.
 */
@Injectable()
export class BusinessConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<BusinessConfig> {
    const row = await this.prisma.businessConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
    return { monthStartDay: row.monthStartDay };
  }

  /** Atajo para los reportes: día (1–28) en que arranca el mes del negocio. */
  async getMonthStartDay(): Promise<number> {
    return (await this.get()).monthStartDay;
  }

  async update(input: UpdateBusinessConfig, actorId: string): Promise<BusinessConfig> {
    const before = await this.get();
    const row = await this.prisma.businessConfig.upsert({
      where: { id: SINGLETON_ID },
      update: { monthStartDay: input.monthStartDay },
      create: { id: SINGLETON_ID, monthStartDay: input.monthStartDay },
    });
    await this.audit.log({
      userId: actorId,
      action: 'BUSINESS_CONFIG_UPDATED',
      entityType: 'business_config',
      entityId: SINGLETON_ID,
      before,
      after: { monthStartDay: row.monthStartDay },
    });
    return { monthStartDay: row.monthStartDay };
  }
}
