import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ReconciliationSourceEnum,
  type CashierAnomalies,
  type ReconciliationReport,
  type ReconciliationSource,
} from '@pos-tercos/types';
import type { Express } from 'express';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { ReconciliationService } from './reconciliation.service';
import { ReportsService } from './reports.service';

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /** FASE 11.D: anomalías por cajero (2σ del histórico personal). Solo Dueño. */
  @OnlyDueno()
  @Get('anomalies')
  getAnomalies(): Promise<CashierAnomalies[]> {
    return this.reports.getAnomalies();
  }

  /** FASE 11.E: import CSV Nequi/Bancolombia + match contra sales digitales. */
  @OnlyDueno()
  @Post('payment-reconciliation/import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_CSV_BYTES } }),
  )
  async importReconciliation(
    @Query('source') sourceRaw: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ReconciliationReport> {
    if (!file) throw new BadRequestException('Multipart "file" requerido.');
    if (!sourceRaw) throw new BadRequestException('Query param ?source= requerido.');
    const parsed = ReconciliationSourceEnum.safeParse(sourceRaw);
    if (!parsed.success) {
      throw new BadRequestException(
        `Source inválido: "${sourceRaw}". Valores: NEQUI_CSV | BANCOLOMBIA_CSV.`,
      );
    }
    const source: ReconciliationSource = parsed.data;
    const csvText = file.buffer.toString('utf8');
    return this.reconciliation.reconcile(source, csvText);
  }
}
