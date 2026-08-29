import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  buildOwnerAlertTemplate,
  WHATSAPP_TEMPLATE_LANG_DEFAULT,
  type AlertChannel,
  type WhatsAppProvider,
} from '@pos-tercos/domain';
import { ALERT_CHANNEL } from '../adapters/alerts/alerts.module';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { AuditService } from '../audit/audit.service';
import { templatesEnabled } from './notification.service';

export type OwnerAlertKind =
  | 'shift_discrepancy'
  | 'sale_voided'
  | 'drawer_no_sale'
  | 'cost_increase'
  | 'cortesia_request'
  | 'cortesia_given'
  | 'manual_discount'
  | 'server_error'
  | 'multi_instance'
  /** El mes va con margen de contribución negativo: cada venta pierde plata. */
  | 'negative_contribution_margin';

/**
 * Avisos que NO son de negocio: fallas del sistema. Van al canal técnico
 * (Issue de GitHub), no al WhatsApp del dueño — a quien un stack trace no le
 * sirve de nada.
 */
const TECHNICAL_KINDS = new Set<OwnerAlertKind>(['server_error', 'multi_instance']);

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
    @Inject(ALERT_CHANNEL) private readonly alertChannel: AlertChannel,
    private readonly audit: AuditService,
  ) {}

  /** @returns true solo si el proveedor REAL aceptó el mensaje. */
  async alert(
    kind: OwnerAlertKind,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    // Las técnicas no son para el dueño: son para quien mantiene el código, y
    // van por un canal que NO depende de que exista un WhatsApp conectado
    // (hoy no lo hay). Si ese canal tampoco entrega, sigue el camino de
    // siempre y queda el registro honesto de que no salió.
    if (TECHNICAL_KINDS.has(kind) && this.alertChannel.delivers) {
      return this.reportTechnical(kind, text, metadata);
    }

    const phone = process.env.OWNER_WHATSAPP_PHONE?.trim();
    if (!phone) return false;
    // Sin proveedor real (mock) no se finge el envío: se loguea y se registra
    // delivered:false — antes el mock devolvía ok:true y la bitácora afirmaba
    // alertas que nunca salieron (patrón "no fingir efectos", §7.v22).
    if (this.wa.delivers === false) {
      this.logger.log(`Sin proveedor de WhatsApp: alerta '${kind}' al dueño NO enviada.`);
      try {
        await this.audit.log({
          userId: null,
          action: 'OWNER_ALERT_SENT',
          entityType: 'owner_alert',
          metadata: { kind, ok: false, delivered: false, error: 'sin proveedor', ...metadata },
        });
      } catch {
        // la bitácora es best-effort
      }
      return false;
    }
    try {
      // Cloud API: la alerta al dueño es business-initiated → con templates
      // activos va por `alerta_negocio` (texto aplanado a una línea); si no,
      // texto libre (mock/sandbox).
      const result =
        templatesEnabled() && this.wa.sendTemplate
          ? await this.wa.sendTemplate(
              phone,
              buildOwnerAlertTemplate(
                text,
                process.env.WHATSAPP_TEMPLATE_LANG ?? WHATSAPP_TEMPLATE_LANG_DEFAULT,
              ),
            )
          : await this.wa.sendText(phone, text);
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
          delivered: result.ok,
          error: result.error ?? null,
          providerMessageId: result.providerMessageId ?? null,
          ...metadata,
        },
      });
      return result.ok;
    } catch (err) {
      this.logger.warn(
        `Alerta '${kind}' al dueño lanzó: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /** Publica el aviso en el canal técnico y lo deja en la bitácora. */
  private async reportTechnical(
    kind: OwnerAlertKind,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const signature = typeof metadata?.signature === 'string' ? metadata.signature : kind;
    // Los asteriscos son negrita de WhatsApp; fuera de ahí son ruido.
    const body = text.replace(/\*/g, '');
    const result = await this.alertChannel.send({
      signature,
      title: signature,
      body: `${body}\n\nDetalle: ${JSON.stringify(metadata ?? {})}\nLogs: railway logs --service api-prod`,
    });
    if (!result.ok) {
      this.logger.warn(`Aviso técnico '${kind}' no salió: ${result.error ?? 'sin detalle'}`);
    }
    try {
      await this.audit.log({
        userId: null,
        action: 'OWNER_ALERT_SENT',
        entityType: 'owner_alert',
        metadata: {
          kind,
          channel: this.alertChannel.name,
          ok: result.ok,
          delivered: result.delivered,
          error: result.error ?? null,
          ref: result.ref ?? null,
          ...metadata,
        },
      });
    } catch {
      // la bitácora es best-effort
    }
    return result.ok;
  }
}
