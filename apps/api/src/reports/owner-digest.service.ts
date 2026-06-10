import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { WhatsAppProvider } from '@pos-tercos/domain';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { AuditService } from '../audit/audit.service';
import { SalesReportsService } from './sales-reports.service';

/**
 * Resumen diario del negocio al WhatsApp del DUEÑO (no al cliente). Reusa
 * el generador IA de `daily-ai-summary` y el WhatsAppProvider (OpenWA real
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
    @Inject(WHATSAPP_PROVIDER) private readonly wa: WhatsAppProvider,
  ) {}

  /** 21:30 — después del cierre típico, antes de que el dueño se acueste. */
  @Cron('30 21 * * *')
  async sendDailyDigestCron(): Promise<void> {
    try {
      await this.sendDailyDigest();
    } catch (err) {
      // Cron non-throwing: un fallo del LLM o de OpenWA no debe tumbar nada.
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
    const phone = process.env.OWNER_WHATSAPP_PHONE;
    if (!phone) {
      return { sent: false, reason: 'OWNER_WHATSAPP_PHONE no configurado' };
    }

    const summary = await this.salesReports.getDailyAiSummary(date);
    const businessName = process.env.BUSINESS_NAME ?? 'Tercos';
    const text = `📊 *Resumen del día — ${businessName}*\n\n${summary.text}`;

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
}
