import { Controller, Get, Query } from '@nestjs/common';
import type { AuditAction, AuditLogEntry } from '@pos-tercos/types';
import { AuditActionEnum } from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';

// AdminAccess (no OnlyDueno): la Bitácora operativa (vista filtrada) la usa el
// Admin Operativo. La página de "Auditoría completa" (log crudo) se restringe
// al Dueño desde la UI; este endpoint es la fuente común de ambas vistas.
@AdminAccess()
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
