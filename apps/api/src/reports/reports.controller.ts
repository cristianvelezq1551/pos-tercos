import { Controller, Get } from '@nestjs/common';
import type { CashierAnomalies } from '@pos-tercos/types';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** FASE 11.D: anomalías por cajero (2σ del histórico personal). Solo Dueño. */
  @OnlyDueno()
  @Get('anomalies')
  getAnomalies(): Promise<CashierAnomalies[]> {
    return this.reports.getAnomalies();
  }
}
