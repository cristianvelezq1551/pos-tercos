import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { JwtAccessPayload } from '@pos-tercos/types';

/**
 * Errores del navegador en las pantallas SIN sesión de caja: la web del
 * cliente, la de cocina (falla también en el login) y el TV. Hasta ahora, un
 * checkout que se rompía en el teléfono de alguien no dejaba rastro en ningún
 * lado.
 *
 * Es público por necesidad —el cliente de la web es anónimo— así que la
 * defensa NO es la sesión sino la forma: campos fijos, largos cortos, sin
 * objeto libre, sin persistir en la base y sin devolver nada. Lo peor que
 * puede hacer alguien que abuse es gastar líneas de log.
 */
const PublicClientLogSchema = z.object({
  app: z.enum(['web', 'cocina', 'display']),
  scope: z.string().min(1).max(40),
  message: z.string().min(1).max(300),
  /** En qué pantalla pasó. Sin esto, un error suelto no se puede reproducir. */
  path: z.string().max(120).optional(),
});
type PublicClientLog = z.infer<typeof PublicClientLogSchema>;

const ClientLogSchema = z.object({
  scope: z.string().min(1).max(60),
  message: z.string().min(1).max(500),
  context: z.record(z.unknown()).optional(),
});
type ClientLog = z.infer<typeof ClientLogSchema>;

/**
 * Aplana saltos de línea y caracteres de control (CWE-117). El texto lo manda
 * el cliente: con un `\n` se pueden FORJAR líneas de log completas —
 * "2026-01-01 ERROR [Auth] login exitoso admin@…"— y ensuciar justo la
 * evidencia que se mira cuando algo huele mal. Requiere sesión de cajero, así
 * que el atacante sería del equipo: exactamente el caso que el log documenta.
 */
function singleLine(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]/g, ' ');
}

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

  /**
   * Tope deliberadamente bajo. Ojo: el navegador llega por el rewrite `/api`
   * de Next, así que la IP que ve el API puede ser la de Vercel y no la de la
   * persona — con lo cual el tope funciona como límite GLOBAL de ingesta.
   * Es aceptable: si se llena, se pierden líneas de log, no se rompe nada.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('public')
  @HttpCode(204)
  reportPublic(@Body(new ZodValidationPipe(PublicClientLogSchema)) body: PublicClientLog): void {
    this.logger.warn(
      `[${singleLine(body.app)}] ${singleLine(body.scope)} :: ${singleLine(body.message)}` +
        (body.path ? ` :: en ${singleLine(body.path)}` : ''),
    );
  }

  @CashierAccess()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(204)
  report(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(ClientLogSchema)) body: ClientLog,
  ): void {
    this.logger.warn(
      `[client] ${singleLine(body.scope)} :: ${singleLine(body.message)} :: user=${user.email}${
        body.context ? ` :: ${singleLine(JSON.stringify(body.context).slice(0, 300))}` : ''
      }`,
    );
  }
}
