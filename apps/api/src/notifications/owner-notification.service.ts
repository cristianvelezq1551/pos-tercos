import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  buildOwnerAlertTemplate,
  WHATSAPP_TEMPLATE_LANG_DEFAULT,
  type AlertChannel,
  type WhatsAppProvider,
} from '@pos-tercos/domain';
import { splitOwnerAlert } from '@pos-tercos/domain';
import { ALERT_CHANNEL } from '../adapters/alerts/alerts.module';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { AuditService } from '../audit/audit.service';
import { templatesEnabled } from './notification.service';
import { PushSubscriptionsService } from './push-subscriptions.service';

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
  | 'negative_contribution_margin'
  /** Insumos que cruzaron el mínimo en el escaneo horario. */
  | 'low_stock';

/**
 * Avisos que NO son de negocio: fallas del sistema. Van al canal técnico
 * (Issue de GitHub), no al WhatsApp del dueño — a quien un stack trace no le
 * sirve de nada.
 */
const TECHNICAL_KINDS = new Set<OwnerAlertKind>(['server_error', 'multi_instance']);

/**
 * A dónde lleva el aviso al tocarlo. Una notificación que abre el inicio deja a
 * la persona buscando de qué le hablaban; el valor está en aterrizar en la
 * pantalla donde se resuelve.
 */
const PANTALLA_POR_TIPO: Record<OwnerAlertKind, string> = {
  shift_discrepancy: '/shifts',
  sale_voided: '/caja/historial',
  drawer_no_sale: '/bitacora',
  cost_increase: '/invoices',
  cortesia_request: '/solicitudes',
  cortesia_given: '/solicitudes',
  manual_discount: '/caja/historial',
  negative_contribution_margin: '/finanzas/estado',
  low_stock: '/purchase-lists',
  server_error: '/bitacora',
  multi_instance: '/bitacora',
};

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
    private readonly push: PushSubscriptionsService,
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

    // Las notificaciones del navegador van PRIMERO y, si alguien las recibe,
    // no se manda además el WhatsApp: para el dueño son el mismo aviso dos
    // veces. WhatsApp queda de respaldo para el día que exista un proveedor
    // real (hoy el adapter es el mock y no entrega, §7.v22).
    if (this.push.delivers) {
      const outcome = await this.pushAlert(kind, text, metadata);
      if (outcome) return true;
    }

    const phone = process.env.OWNER_WHATSAPP_PHONE?.trim();
    if (!phone) {
      // Ni notificaciones ni WhatsApp: el aviso no le llega a NADIE. Antes se
      // descartaba en silencio y no quedaba ni una fila — o sea que ni
      // revisando la bitácora se podía saber que había pasado algo. Ahora al
      // menos queda dicho, con su motivo.
      this.logger.warn(`Sin ningún canal: alerta '${kind}' al dueño NO se envió.`);
      try {
        await this.audit.log({
          userId: null,
          action: 'OWNER_ALERT_SENT',
          entityType: 'owner_alert',
          metadata: {
            ...metadata,
            kind,
            ok: false,
            delivered: false,
            error: 'no hay ningún canal de avisos configurado',
          },
        });
      } catch {
        // la bitácora es best-effort
      }
      return false;
    }
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
          metadata: { ...metadata, kind, ok: false, delivered: false, error: 'sin proveedor' },
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
          ...metadata,
          kind,
          ok: result.ok,
          delivered: result.ok,
          error: result.error ?? null,
          providerMessageId: result.providerMessageId ?? null,
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

  /**
   * Manda el aviso a los dispositivos del dueño y los administradores.
   * @returns true solo si al menos un dispositivo lo recibió.
   */
  private async pushAlert(
    kind: OwnerAlertKind,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    // El texto viene armado para WhatsApp (una sola cadena); una notificación
    // rinde título y cuerpo por separado. `splitOwnerAlert` los separa sin
    // tocar a los 14 llamadores.
    const { title, body } = splitOwnerAlert(text);
    try {
      const outcome = await this.push.broadcastToOwners({
        title,
        // Los asteriscos son negrita de WhatsApp; en una notificación son ruido.
        body: body.replace(/\*/g, ''),
        url: PANTALLA_POR_TIPO[kind],
        // Agrupa por tipo: dos descuadres seguidos dejan un aviso, no dos.
        tag: kind,
      });
      await this.audit.log({
        userId: null,
        action: 'OWNER_ALERT_SENT',
        entityType: 'owner_alert',
        metadata: {
          ...metadata,
          // Las señas del aviso van DESPUÉS del spread: si no, un llamador que
          // mande su propio `kind` (los tres caminos del descuadre lo hacen)
          // pisa la identidad de la alerta y la bitácora deja de ser uniforme.
          kind,
          channel: 'web-push',
          ok: outcome.sent > 0,
          delivered: outcome.sent > 0,
          error: outcome.reason,
          devices: outcome.sent,
        },
      });
      if (outcome.sent === 0) {
        this.logger.warn(`Alerta '${kind}' sin dispositivos: ${outcome.reason ?? 'sin detalle'}`);
      }
      return outcome.sent > 0;
    } catch (err) {
      // Un fallo del push NO puede impedir el intento por WhatsApp.
      this.logger.warn(
        `Alerta '${kind}' por notificación lanzó: ${err instanceof Error ? err.message : err}`,
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
          ...metadata,
          kind,
          channel: this.alertChannel.name,
          ok: result.ok,
          delivered: result.delivered,
          error: result.error ?? null,
          ref: result.ref ?? null,
        },
      });
    } catch {
      // la bitácora es best-effort
    }
    return result.ok;
  }
}
