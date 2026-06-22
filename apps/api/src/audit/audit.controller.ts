import { Controller, Get, Query } from '@nestjs/common';
import type { AuditAction, AuditLogEntry } from '@pos-tercos/types';
import { AuditActionEnum } from '@pos-tercos/types';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';

// OnlyDueno: tanto la Bitácora (vista filtrada) como la "Auditoría completa"
// (log crudo) son solo del Dueño. Decisión 2026-06-22: el Admin Operativo NO
// ve el registro de auditoría — antes era @AdminAccess y dejaba que el
// operativo leyera el log crudo sin filtro por API.
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
    // `action` acepta una o varias acciones separadas por coma (bitácora).
    const actions: AuditAction[] = [];
    if (action) {
      for (const a of action.split(',')) {
        const parsed = AuditActionEnum.safeParse(a.trim());
        if (parsed.success) actions.push(parsed.data);
      }
    }
    return this.audit.list({
      userId,
      action: actions.length === 1 ? actions[0] : undefined,
      actions: actions.length > 1 ? actions : undefined,
      entityType,
      entityId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Math.min(Number(limit), 500) : undefined,
    });
  }
}
