import { Body, Controller, Post } from '@nestjs/common';
import { SetApprovalPinSchema, type SetApprovalPin } from '@pos-tercos/types';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
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
   * FASE 11.C: cualquier usuario con rol que pueda tener PIN (ADMIN_OPERATIVO
   * o DUENO) cambia SU PROPIO PIN. El path `/approvals/pin` se mantiene
   * (en 5.B era Dueño-only para bootstrap; ahora es Admin+Dueño).
   *
   * NO se permite que un Admin/Dueño cambie el PIN de OTRO usuario desde
   * acá — ese flujo (reset por Dueño) entra en FASE 14 si se decide habilitar.
   */
  @AdminAccess()
  @Post('pin')
  async setOwnPin(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(SetApprovalPinSchema)) body: SetApprovalPin,
  ): Promise<{ ok: true }> {
    await this.approvals.assertPassword(user.sub, body.password); // 403 si la clave no matchea
    await this.approvals.setPin(user.sub, body.pin);
    await this.audit.log({
      userId: user.sub,
      action: 'APPROVAL_PIN_SET',
      entityType: 'user',
      entityId: user.sub,
      metadata: { self: true, role: user.role },
    });
    return { ok: true };
  }
}
