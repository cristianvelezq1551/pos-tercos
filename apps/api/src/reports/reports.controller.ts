import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ReconciliationSourceEnum,
  SalesGranularityEnum,
  type AiSummary,
  type CashierAnomalies,
  type DashboardSummary,
  type FinanceSummary,
  type FinancialAnalysis,
  type HourHeatmapReport,
  type InventoryUsageReport,
  type PurchasesReport,
  PurchaseGranularityEnum,
  type FifoLotsResponse,
  type InventoryValuationReport,
  type JwtAccessPayload,
  type MonthlyFinancialStatement,
  type MonthlyTrend,
  type PnlReport,
  type ProductMarginReport,
  type ReconciliationReport,
  type ReconciliationSource,
  type Sale,
  type SalesSummary,
  type SavedReconciliation,
  type SavedReconciliationDetail,
  type SuggestionsMetrics,
  type TopProductsReport,
  type WhatsAppMetrics,
} from '@pos-tercos/types';
import type { Express } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { CogsService } from './cogs.service';
import { FinanceSummaryService } from './finance-summary.service';
import { InventoryUsageService } from './inventory-usage.service';
import { PurchasesReportService } from './purchases-report.service';
import { OwnerDigestService } from './owner-digest.service';
import { FinancialReportsService } from './financial-reports.service';
import { ReconciliationService } from './reconciliation.service';
import { ReportsService } from './reports.service';
import { SalesReportsService } from './sales-reports.service';
import { parseDateRange } from '../common/local-dates';

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly reconciliation: ReconciliationService,
    private readonly salesReports: SalesReportsService,
    private readonly cogs: CogsService,
    private readonly financial: FinancialReportsService,
    private readonly financeSummary: FinanceSummaryService,
    private readonly inventoryUsage: InventoryUsageService,
    private readonly purchases: PurchasesReportService,
    private readonly ownerDigest: OwnerDigestService,
  ) {}

  // ==================================================================
  // Cockpit financiero (cash-based) — Dueño-only
  // ==================================================================

  /** Resumen mensual: ingresos, pagado, pendiente, neto + listas de detalle. */
  @OnlyDueno()
  @Get('finance-summary')
  getFinanceSummary(
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
  ): Promise<FinanceSummary> {
    const now = new Date();
    const year = yearStr ? Number.parseInt(yearStr, 10) : now.getFullYear();
    const month1 = monthStr ? Number.parseInt(monthStr, 10) : now.getMonth() + 1;
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year inválido.');
    }
    if (!Number.isFinite(month1) || month1 < 1 || month1 > 12) {
      throw new BadRequestException('month debe estar entre 1 y 12.');
    }
    return this.financeSummary.getMonthlySummary(year, month1);
  }

  // ==================================================================
  // Estado financiero mensual (P&G + break-even + IA) — Dueño-only
  // ==================================================================

  @OnlyDueno()
  @Get('financial/monthly')
  monthlyFinancial(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<MonthlyFinancialStatement> {
    const { y, m } = parseYearMonth(year, month);
    return this.financial.getMonthlyStatement(y, m);
  }

  @OnlyDueno()
  @Get('financial/trend')
  financialTrend(
    @Query('months') months?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<MonthlyTrend> {
    const n = Math.max(1, Math.min(Number(months) || 6, 12));
    if (year === undefined && month === undefined) {
      return this.financial.getMonthlyTrend(n, undefined, undefined);
    }
    const { y, m } = parseYearMonth(year, month);
    return this.financial.getMonthlyTrend(n, y, m);
  }

  @OnlyDueno()
  @Post('financial/analyze')
  analyzeFinancial(
    @CurrentUser() user: JwtAccessPayload,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<FinancialAnalysis> {
    const { y, m } = parseYearMonth(year, month);
    return this.financial.analyze(y, m, user.sub);
  }

  // ==================================================================
  // Costeo real FIFO (COGS) — Dueño-only (P&L y márgenes son sensibles)
  // ==================================================================

  /** P&L del período: ventas − costo real (FIFO) − merma valorizada. */
  @OnlyDueno()
  @Get('cogs/pnl')
  getPnl(@Query('from') from?: string, @Query('to') to?: string): Promise<PnlReport> {
    const range = parseDateRange(from, to, 30);
    return this.cogs.getPnl(range.from, range.to);
  }

  /** Margen real por producto (costo FIFO, atribución exacta por venta). */
  @OnlyDueno()
  @Get('cogs/product-margins')
  getProductMargins(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ProductMarginReport> {
    const range = parseDateRange(from, to, 30);
    return this.cogs.getProductMargins(range.from, range.to);
  }

  /** Valor del inventario a costo real (lotes FIFO restantes). */
  @OnlyDueno()
  @Get('cogs/inventory-valuation')
  getInventoryValuation(): Promise<InventoryValuationReport> {
    return this.cogs.getInventoryValuation();
  }

  /** Lotes FIFO restantes por stockable — para el desglose de rendimiento y
   *  costo por lote de cada insumo/subproducto en el editor de receta ("tu
   *  inventario rinde N porciones a $X"). `@AdminAccess` es DELIBERADO: el admin
   *  operativo necesita ver los costos por lote para gestionar recetas (a
   *  diferencia del resto de reportes financieros que son Dueño-only). */
  @AdminAccess()
  @Get('cogs/fifo-lots')
  getFifoLots(): Promise<FifoLotsResponse> {
    return this.cogs.getFifoLots();
  }

  // ==================================================================
  // FASE 13.A — Reportes operativos / negocio
  // ==================================================================

  /** Dashboard home: resumen del día en una sola query. Dueño. */
  @OnlyDueno()
  @Get('dashboard')
  getDashboard(): Promise<DashboardSummary> {
    return this.salesReports.getDashboardSummary();
  }

  /** Resumen diario en lenguaje natural (IA). On-demand. Dueño. */
  @OnlyDueno()
  @Get('daily-ai-summary')
  getDailyAiSummary(@Query('date') date?: string): Promise<AiSummary> {
    const day = date ? new Date(`${date}T12:00:00`) : new Date();
    return this.salesReports.getDailyAiSummary(day);
  }

  /** Series temporales + breakdowns. Default: últimos 7 días. Dueño. */
  @OnlyDueno()
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

  /**
   * Listado detallado de ventas (mismo universo que el resumen: solo pagadas).
   * Con `shift_id` lista lo cobrado en ESA caja (la sesión puede cruzar
   * medianoche); sin él, el período por fechas. Default: últimos 7 días. Dueño.
   */
  @OnlyDueno()
  @Get('sales-detail')
  getSalesDetail(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('shift_id', new ParseUUIDPipe({ optional: true })) shiftId?: string,
  ): Promise<Sale[]> {
    if (shiftId) {
      return this.salesReports.getSalesDetailByShift(shiftId);
    }
    const range = parseDateRange(from, to);
    return this.salesReports.getSalesDetail(range.from, range.to);
  }

  /** Top productos por revenue (con costo y margen estimado). Dueño. */
  @OnlyDueno()
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

  /**
   * Trigger manual del resumen diario por WhatsApp al dueño (el cron corre
   * 21:30 hora local). Sirve para probar el flujo sin esperar la noche.
   */
  @OnlyDueno()
  @Post('admin/send-daily-digest')
  sendDailyDigest(): Promise<{ sent: boolean; reason?: string; modelUsed?: string }> {
    return this.ownerDigest.sendDailyDigest();
  }

  /**
   * Trigger manual del aviso de margen de contribución negativo (el cron corre
   * 21:45 hora local). Devuelve por qué NO mandó cuando no corresponde —así se
   * verifica el flujo sin esperar a la noche ni adivinar.
   */
  @OnlyDueno()
  @Post('admin/check-contribution-margin')
  checkContributionMargin(): Promise<{
    sent: boolean;
    reason?: string;
    contributionMargin?: number;
  }> {
    return this.ownerDigest.alertIfNegativeContributionMargin();
  }

  /**
   * Trigger manual del snapshot mensual del ledger FIFO (el cron corre el
   * día 2, 4:30 AM). Corte = primer día del mes actual 00:00 local.
   */
  @OnlyDueno()
  @Post('admin/ledger-snapshot')
  createLedgerSnapshot(): Promise<{ cutoffAt: string; movementsCount: number; lotsCount: number }> {
    return this.cogs.createLedgerSnapshot();
  }

  /**
   * Uso y mermas por insumo: consumo por ventas/producción (teórico, sale de
   * recetas) vs mermas declaradas y faltantes de conteo, valorizado.
   * Dueño.
   */
  @OnlyDueno()
  @Get('inventory-usage')
  getInventoryUsage(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<InventoryUsageReport> {
    const range = parseDateRange(from, to, 30);
    return this.inventoryUsage.getUsage(range.from, range.to);
  }

  /**
   * Compras y fletes del período, por semana/mes y por proveedor. Dueño.
   *
   * Es el único lugar donde el flete se compara contra lo comprado: ese
   * porcentaje —y no el monto— es lo que dice si vale la pena negociar.
   */
  @OnlyDueno()
  @Get('purchases')
  getPurchases(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: string,
  ): Promise<PurchasesReport> {
    // Default 30 días: una sola semana no deja comparar contra nada.
    const range = parseDateRange(from, to, 30);
    // Un valor inválido no cae al default en silencio — el reporte saldría con
    // otro agrupamiento del pedido y nadie lo notaría (§B9). El error se lanza a
    // mano y en español: el ZodError crudo llega a la pantalla en inglés (§3).
    const parsed = PurchaseGranularityEnum.safeParse(granularity ?? 'weekly');
    if (!parsed.success) {
      throw new BadRequestException('El agrupamiento debe ser por semana o por mes.');
    }
    return this.purchases.getPurchases(range.from, range.to, parsed.data);
  }

  /** Heatmap día de semana × hora. Dueño. */
  @OnlyDueno()
  @Get('hour-heatmap')
  getHourHeatmap(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<HourHeatmapReport> {
    const range = parseDateRange(from, to, 30); // default 30 días para tener señal
    return this.salesReports.getHourHeatmap(range.from, range.to);
  }

  /** Cobertura WhatsApp por stage (lee de whatsapp_messages, status='sent'). Dueño. */
  @OnlyDueno()
  @Get('whatsapp-metrics')
  getWhatsAppMetrics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<WhatsAppMetrics> {
    const range = parseDateRange(from, to);
    return this.salesReports.getWhatsAppMetrics(range.from, range.to);
  }

  /** Métricas IA: sugerencias creadas/evaluadas/aceptadas. Dueño. */
  @OnlyDueno()
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

  /**
   * FASE 11.E + 14.D: import CSV Nequi/Bancolombia + match contra sales
   * digitales. Si `?save=true`, persiste el reporte para histórico.
   */
  @OnlyDueno()
  @Post('payment-reconciliation/import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_CSV_BYTES } }),
  )
  async importReconciliation(
    @CurrentUser() user: JwtAccessPayload,
    @Query('source') sourceRaw: string | undefined,
    @Query('save') saveFlag: string | undefined,
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
    const report = await this.reconciliation.reconcile(source, csvText);
    if (saveFlag === 'true') {
      await this.reconciliation.saveReport(report, user.sub);
    }
    return report;
  }

  /** FASE 14.D: histórico de reports persistidos. */
  @OnlyDueno()
  @Get('payment-reconciliation/history')
  listSavedReconciliations(
    @Query('source') sourceRaw?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<SavedReconciliation[]> {
    let source: ReconciliationSource | undefined;
    if (sourceRaw) {
      const parsed = ReconciliationSourceEnum.safeParse(sourceRaw);
      if (parsed.success) source = parsed.data;
    }
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : 50;
    return this.reconciliation.listSaved({ source, limit });
  }

  /** FASE 14.D: detalle de un report guardado (incluye filas). */
  @OnlyDueno()
  @Get('payment-reconciliation/history/:id')
  getSavedReconciliation(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SavedReconciliationDetail> {
    return this.reconciliation.getSavedDetail(id);
  }
}

/**
 * Valida ?year=&month= de los endpoints financieros. Sin validar, `month=13`
 * rebalsaba en silencio a enero del año siguiente (rollover de `new Date`) y
 * `month=abc` terminaba en un 500 de Prisma con Invalid Date.
 */
function parseYearMonth(
  year: string | undefined,
  month: string | undefined,
): { y: number; m: number } {
  const now = new Date();
  const y = year === undefined ? now.getFullYear() : Number(year);
  const m = month === undefined ? now.getMonth() + 1 : Number(month);
  if (!Number.isInteger(y) || y < 2020 || y > 2100) {
    throw new BadRequestException('El año del reporte no es válido.');
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new BadRequestException('El mes del reporte debe estar entre 1 y 12.');
  }
  return { y, m };
}

