import { Body, Controller, Post } from '@nestjs/common';
import { SetApprovalPinSchema, type SetApprovalPin } from '@pos-tercos/types';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApprovalsService } from './approvals.service';

@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Setea/resetea el PIN del Dueño autenticado. UI completa (Admins
   * cambiando su propio PIN, Dueño reseteando el de Admins) entra en
   * FASE 11. En 5.B este endpoint sirve para bootstrap inicial del PIN
   * del Dueño así se pueden testear voids.
   */
  @OnlyDueno()
  @Post('pin')
  async setOwnPin(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(SetApprovalPinSchema)) body: SetApprovalPin,
  ): Promise<{ ok: true }> {
    await this.approvals.setPin(user.sub, body.pin);
    await this.audit.log({
      userId: user.sub,
      action: 'APPROVAL_PIN_SET',
      entityType: 'user',
      entityId: user.sub,
      metadata: { self: true },
    });
    return { ok: true };
  }
}
