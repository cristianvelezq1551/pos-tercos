import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { JwtAccessPayload } from '@pos-tercos/types';

const ClientLogSchema = z.object({
  scope: z.string().min(1).max(60),
  message: z.string().min(1).max(500),
  context: z.record(z.unknown()).optional(),
});
type ClientLog = z.infer<typeof ClientLogSchema>;

/**
 * Errores best-effort del POS (impresora, IndexedDB, sockets) reportados al
 * servidor: quedan en los logs de Railway con prefijo [client] para
 * diagnosticar "no imprimió" / "se perdió una venta" sin ir al mostrador.
 * No persiste en DB (es telemetría, no negocio); el ring buffer local del
 * POS (window.__posLogs) conserva el detalle en el dispositivo.
 */
@Controller('client-logs')
export class ClientLogsController {
  private readonly logger = new Logger('ClientLog');

  @CashierAccess()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(204)
  report(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(ClientLogSchema)) body: ClientLog,
  ): void {
    this.logger.warn(
      `[client] ${body.scope} :: ${body.message} :: user=${user.email}${
        body.context ? ` :: ${JSON.stringify(body.context).slice(0, 300)}` : ''
      }`,
    );
  }
}
