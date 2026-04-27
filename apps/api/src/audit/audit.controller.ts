import { Controller, Get, Query } from '@nestjs/common';
import type { AuditLogEntry } from '@pos-tercos/types';
import { AuditActionEnum } from '@pos-tercos/types';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';

@OnlyDueno()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('user_id') userId?: string,
    @Query('action') action?: string,
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditLogEntry[]> {
    const parsedAction = action ? AuditActionEnum.safeParse(action) : null;
    return this.audit.list({
      userId,
      action: parsedAction?.success ? parsedAction.data : undefined,
      entityType,
      entityId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Math.min(Number(limit), 500) : undefined,
    });
  }
}
