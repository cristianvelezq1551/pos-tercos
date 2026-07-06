import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService, type HealthStatus } from './health.service';

@Controller('healthz')
export class HealthController {
  constructor(private readonly health: HealthService) {}

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
}
