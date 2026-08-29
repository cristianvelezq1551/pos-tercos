import { Controller, Get, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import type { AlertChannel, AlertDeliveryResult } from '@pos-tercos/domain';
import type { Response } from 'express';
import { ALERT_CHANNEL } from '../adapters/alerts/alerts.module';
import { Public } from '../auth/decorators/public.decorator';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { HealthService, type HealthStatus } from './health.service';

@Controller('healthz')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    @Inject(ALERT_CHANNEL) private readonly alertChannel: AlertChannel,
  ) {}

  /**
   * Con la DB caída responde **503** (no 200-degraded): el heartbeat del POS
   * mira `res.ok` — con 200 el POS se creía online, las ventas reventaban con
   * 5xx y NO se encolaban offline (informe de calidad A1). El 503 también
   * permite que un monitor externo (UptimeRobot) detecte la DB caída.
   */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const status = await this.health.check();
    if (status.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return status;
  }

  /**
   * Simulacro: dispara un aviso REAL por el canal técnico y devuelve a dónde
   * fue a parar. Existe porque una alarma que nadie probó es una alarma que
   * no se sabe si suena — el WhatsApp del dueño estuvo mudo meses sin que
   * nadie lo notara (§7.v22). Repetirlo cada ~6 meses (BIBLIA §5.2).
   */
  @OnlyDueno()
  @Post('alert-drill')
  @HttpCode(HttpStatus.OK)
  async alertDrill(): Promise<AlertDeliveryResult & { channel: string }> {
    const result = await this.alertChannel.send({
      signature: 'SIMULACRO de alerta (no es una falla real)',
      title: 'Simulacro',
      body:
        'Esto es una prueba manual del canal de avisos. Si estás leyendo esto, ' +
        'un error del servidor SÍ te llegaría. Cierra este aviso.',
    });
    return { ...result, channel: this.alertChannel.name };
  }
}
