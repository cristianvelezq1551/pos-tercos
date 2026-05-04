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
  SalesGranularityEnum,
  type CashierAnomalies,
  type DashboardSummary,
  type HourHeatmapReport,
  type ReconciliationReport,
  type ReconciliationSource,
  type SalesSummary,
  type SuggestionsMetrics,
  type TopProductsReport,
  type WhatsAppMetrics,
} from '@pos-tercos/types';
import type { Express } from 'express';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { ReconciliationService } from './reconciliation.service';
import { ReportsService } from './reports.service';
import { SalesReportsService } from './sales-reports.service';

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly reconciliation: ReconciliationService,
    private readonly salesReports: SalesReportsService,
  ) {}

  // ==================================================================
  // FASE 13.A — Reportes operativos / negocio
  // ==================================================================

  /** Dashboard home: resumen del día en una sola query. Admin/Dueño. */
  @AdminAccess()
  @Get('dashboard')
  getDashboard(): Promise<DashboardSummary> {
    return this.salesReports.getDashboardSummary();
  }

  /** Series temporales + breakdowns. Default: últimos 7 días. Admin/Dueño. */
  @AdminAccess()
  @Get('sales-summary')
  getSalesSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: string,
  ): Promise<SalesSummary> {
    const range = parseDateRange(from, to);
    const g =
      granularity && SalesGranularityEnum.options.includes(granularity as 'daily' | 'hourly')
        ? (granularity as 'daily' | 'hourly')
        : 'daily';
    return this.salesReports.getSalesSummary(range.from, range.to, g);
  }

  /** Top productos por revenue (con costo y margen estimado). Admin/Dueño. */
  @AdminAccess()
  @Get('top-products')
  getTopProducts(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<TopProductsReport> {
    const range = parseDateRange(from, to);
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 20, 1), 100) : 20;
    return this.salesReports.getTopProducts(range.from, range.to, limit);
  }

  /** Heatmap día de semana × hora. Admin/Dueño. */
  @AdminAccess()
  @Get('hour-heatmap')
  getHourHeatmap(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<HourHeatmapReport> {
    const range = parseDateRange(from, to, 30); // default 30 días para tener señal
    return this.salesReports.getHourHeatmap(range.from, range.to);
  }

  /** Cobertura WhatsApp por stage (FASE 9 audit log). Admin/Dueño. */
  @AdminAccess()
  @Get('whatsapp-metrics')
  getWhatsAppMetrics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<WhatsAppMetrics> {
    const range = parseDateRange(from, to);
    return this.salesReports.getWhatsAppMetrics(range.from, range.to);
  }

  /** Métricas IA: sugerencias creadas/evaluadas/aceptadas. Admin/Dueño. */
  @AdminAccess()
  @Get('suggestions-metrics')
  getSuggestionsMetrics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<SuggestionsMetrics> {
    const range = parseDateRange(from, to);
    return this.salesReports.getSuggestionsMetrics(range.from, range.to);
  }

  // ==================================================================
  // FASE 11 — Anomalías + Reconciliación (existentes)
  // ==================================================================

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

/**
 * Parsea ?from=&to= como YYYY-MM-DD a Date local (00:00 from, 23:59 to).
 * Default: últimos `defaultDays` días (incluyendo hoy).
 */
function parseDateRange(
  from: string | undefined,
  to: string | undefined,
  defaultDays = 7,
): { from: Date; to: Date } {
  const now = new Date();
  let toDate = to ? parseLocalDate(to) : now;
  if (!toDate) toDate = now;
  const toEnd = new Date(toDate);
  toEnd.setHours(23, 59, 59, 999);

  let fromDate: Date;
  if (from) {
    const parsed = parseLocalDate(from);
    fromDate = parsed ?? new Date(toEnd);
  } else {
    fromDate = new Date(toEnd);
    fromDate.setDate(fromDate.getDate() - (defaultDays - 1));
  }
  fromDate.setHours(0, 0, 0, 0);

  if (fromDate > toEnd) {
    throw new BadRequestException('?from debe ser <= ?to');
  }
  return { from: fromDate, to: toEnd };
}

function parseLocalDate(s: string): Date | null {
  // YYYY-MM-DD → Date local 00:00. Devuelve null si formato inválido.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
