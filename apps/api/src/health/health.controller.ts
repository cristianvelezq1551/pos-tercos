import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService, type HealthStatus } from './health.service';

@Controller('healthz')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  check(): Promise<HealthStatus> {
    return this.health.check();
  }
}
