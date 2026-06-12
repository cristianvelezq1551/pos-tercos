import { Inject, Injectable, Logger } from '@nestjs/common';
import type { WhatsAppProvider } from '@pos-tercos/domain';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { AuditService } from '../audit/audit.service';

export type OwnerAlertKind =
  | 'shift_discrepancy'
  | 'sale_voided'
  | 'drawer_no_sale'
  | 'cost_increase'
  | 'server_error';

/**
 * Alertas puntuales al WhatsApp del DUEÑO (antifraude + costos). Igual que
 * las notificaciones al cliente: FIRE-AND-FORGET — un fallo de WhatsApp
 * jamás revierte la transición de negocio. Los callers usan
 * `void ownerNotifications.alert(...)`.
 *
 * Sin `OWNER_WHATSAPP_PHONE` no envía nada (dev usa MockWhatsAppAdapter,
 * que solo loggea).
 */
@Injectable()
export class OwnerNotificationService {
  private readonly logger = new Logger(OwnerNotificationService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly wa: WhatsAppProvider,
    private readonly audit: AuditService,
  ) {}

  async alert(
    kind: OwnerAlertKind,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const phone = process.env.OWNER_WHATSAPP_PHONE;
    if (!phone) return;
    try {
      const result = await this.wa.sendText(phone, text);
      if (!result.ok) {
        this.logger.warn(`Alerta '${kind}' al dueño falló: ${result.error ?? 'sin detalle'}`);
      }
      await this.audit.log({
        userId: null,
        action: 'OWNER_ALERT_SENT',
        entityType: 'owner_alert',
        metadata: {
          kind,
          ok: result.ok,
          error: result.error ?? null,
          providerMessageId: result.providerMessageId ?? null,
          ...metadata,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Alerta '${kind}' al dueño lanzó: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
