import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { buildOwnerAlert } from '@pos-tercos/domain';
import type { WhatsAppProvider } from '@pos-tercos/domain';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { AuditService } from '../audit/audit.service';
import { businessName } from '../common/business-name';
import { localMidnightOfYmd } from '../common/local-dates';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialReportsService } from './financial-reports.service';
import { SalesReportsService } from './sales-reports.service';

/**
 * Ventas mínimas del mes para avisar por margen negativo. Con un puñado de
 * ventas, una sola merma grande vuelve el margen negativo sin que eso diga
 * nada del negocio; el aviso sería ruido y el dueño dejaría de leerlos.
 */
const MIN_SALES_FOR_MARGIN_ALERT = 20;

/**
 * Resumen diario del negocio al WhatsApp del DUEÑO (no al cliente). Reusa
 * el generador IA de `daily-ai-summary` y el WhatsAppProvider (Kapso real
 * en prod, mock en dev). El dueño "controla" el día sin abrir el admin.
 *
 * Requiere `OWNER_WHATSAPP_PHONE` (E.164). Sin la var, el cron no hace nada.
 * Hora local del server → setear TZ=America/Bogota en prod (igual que el
 * reset diario de turnos).
 */
@Injectable()
export class OwnerDigestService {
  private readonly logger = new Logger(OwnerDigestService.name);

  constructor(
    private readonly salesReports: SalesReportsService,
    private readonly audit: AuditService,
    private readonly financial: FinancialReportsService,
    private readonly ownerNotifications: OwnerNotificationService,
    private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly wa: WhatsAppProvider,
  ) {}

  /** 21:30 — después del cierre típico, antes de que el dueño se acueste. */
  @Cron('30 21 * * *')
  async sendDailyDigestCron(): Promise<void> {
    try {
      await this.sendDailyDigest();
    } catch (err) {
      // Cron non-throwing: un fallo del LLM o de WhatsApp no debe tumbar nada.
      this.logger.warn(`Digest diario falló: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Genera y envía el resumen del día. Devuelve qué pasó (para el trigger
   * manual del endpoint admin).
   */
  async sendDailyDigest(date = new Date()): Promise<{
    sent: boolean;
    reason?: string;
    modelUsed?: string;
  }> {
    const phone = process.env.OWNER_WHATSAPP_PHONE?.trim();
    if (!phone) {
      return { sent: false, reason: 'OWNER_WHATSAPP_PHONE no configurado' };
    }

    const summary = await this.salesReports.getDailyAiSummary(date);
    const text = buildOwnerAlert({
      businessName: businessName(),
      title: 'Resumen del día',
      body: summary.text,
    });

    const result = await this.wa.sendText(phone, text);
    if (!result.ok) {
      this.logger.warn(`Envío del digest falló: ${result.error ?? 'sin detalle'}`);
      return { sent: false, reason: result.error ?? 'envío falló', modelUsed: summary.modelUsed };
    }

    await this.audit.log({
      userId: null,
      action: 'OWNER_DAILY_DIGEST_SENT',
      entityType: 'report',
      metadata: {
        modelUsed: summary.modelUsed,
        textLength: text.length,
        providerMessageId: result.providerMessageId ?? null,
      },
    });
    return { sent: true, modelUsed: summary.modelUsed };
  }

  // ==================================================================
  // Aviso: el mes va con margen de CONTRIBUCIÓN negativo
  // ==================================================================

  /**
   * 21:45 — después del digest, con su propio cron para que un fallo del LLM
   * (que el digest sí necesita) no se lleve puesto este aviso, que no usa IA.
   */
  @Cron('45 21 * * *')
  async checkContributionMarginCron(): Promise<void> {
    try {
      await this.alertIfNegativeContributionMargin();
    } catch (err) {
      this.logger.warn(
        `Chequeo de margen de contribución falló: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Avisa al dueño cuando el margen de contribución del mes se vuelve NEGATIVO:
   * después del costo de la comida, la merma, las cortesías y los reembolsos,
   * cada venta deja MENOS de lo que cuesta. Vender más no acerca a cubrir los
   * costos fijos — los aleja. Es el número que nadie quiere descubrir el día 30.
   *
   * Tres candados contra el ruido, porque una alerta que se ignora no sirve:
   *  1. El mes necesita actividad real (`MIN_SALES_FOR_MARGIN_ALERT`): con 3
   *     ventas, una merma grande vuelve el margen negativo sin significar nada.
   *  2. UNA sola por mes de negocio (se consulta la bitácora antes de mandar).
   *  3. Sin `OWNER_WHATSAPP_PHONE` no manda nada (lo resuelve `alert`).
   */
  async alertIfNegativeContributionMargin(at = new Date()): Promise<{
    sent: boolean;
    reason?: string;
    contributionMargin?: number;
  }> {
    const st = await this.financial.getMonthlyStatement(at.getFullYear(), at.getMonth() + 1);

    if (st.contributionMarginPct === null || st.contributionMargin >= 0) {
      return { sent: false, reason: 'el margen de contribución no es negativo' };
    }
    if (st.salesCount < MIN_SALES_FOR_MARGIN_ALERT) {
      return {
        sent: false,
        reason: `el mes lleva ${st.salesCount} ventas (mínimo ${MIN_SALES_FOR_MARGIN_ALERT} para avisar)`,
        contributionMargin: st.contributionMargin,
      };
    }

    // Ya se avisó en este mes de negocio → no repetir todos los días.
    const yaAvisado = await this.prisma.auditLog.findFirst({
      where: {
        action: 'OWNER_MARGIN_ALERT_SENT',
        createdAt: { gte: localMidnightOfYmd(st.periodStart) },
      },
      select: { id: true },
    });
    if (yaAvisado) {
      return { sent: false, reason: 'ya se avisó este mes', contributionMargin: st.contributionMargin };
    }

    const cop = (n: number): string => `$${Math.round(n).toLocaleString('es-CO')}`;
    const pct = Math.abs(Math.round(st.contributionMarginPct * 100));
    const text = buildOwnerAlert({
      businessName: businessName(),
      title: `${st.monthLabel} va perdiendo plata en cada venta`,
      body:
        `Vendiste ${cop(st.revenue)}. Después del costo de la comida (${cop(st.cogs)}), ` +
      `la merma (${cop(st.wasteCost)}), las cortesías (${cop(st.cortesiasCost)}) y los ` +
      `reembolsos (${cop(st.refundCost)}), quedan ${cop(st.contributionMargin)}.\n\n` +
      `Eso es ${pct}% NEGATIVO: por cada $100 que vendes, pierdes $${pct} antes de pagar ` +
        `arriendo y nómina. Vender más no arregla esto — hay que subir precios o bajar ` +
        `el costo de la comida y la merma.\n\n` +
        `Míralo en Finanzas → Estado.`,
    });

    const delivered = await this.ownerNotifications.alert('negative_contribution_margin', text, {
      month: st.monthLabel,
      revenue: st.revenue,
      contributionMargin: st.contributionMargin,
      contributionMarginPct: st.contributionMarginPct,
    });
    // Se registra aparte del envío: es el candado de "una por mes", y tiene que
    // quedar aunque WhatsApp falle (si no, reintentaría todos los días).
    await this.audit.log({
      userId: null,
      action: 'OWNER_MARGIN_ALERT_SENT',
      entityType: 'report',
      metadata: {
        month: st.monthLabel,
        periodStart: st.periodStart,
        revenue: st.revenue,
        cogs: st.cogs,
        wasteCost: st.wasteCost,
        cortesiasCost: st.cortesiasCost,
        refundCost: st.refundCost,
        contributionMargin: st.contributionMargin,
        contributionMarginPct: st.contributionMarginPct,
        salesCount: st.salesCount,
        // false = no había proveedor real o el envío falló: la fila es el
        // candado mensual, no una afirmación de que el WhatsApp salió.
        delivered,
      },
    });
    return { sent: true, contributionMargin: st.contributionMargin };
  }
}
