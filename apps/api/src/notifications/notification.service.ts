import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  buildNotificationMessage,
  buildNotificationTemplate,
  WHATSAPP_TEMPLATE_LANG_DEFAULT,
  type WhatsAppNotificationStage,
  type WhatsAppProvider,
  type WhatsAppSaleSnapshot,
} from '@pos-tercos/domain';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { PrismaService } from '../prisma/prisma.service';

/** Días de retención de los registros de envío de WhatsApp (PII en claro). */
const WHATSAPP_RETENTION_DAYS = 90;

/**
 * `WHATSAPP_TEMPLATES_ENABLED=true` activa el envío por template (requiere
 * los templates APROBADOS en Meta — kapso-setup.md Paso 3). Se lee en cada
 * envío (no al boot) para poder togglear sin redeploy de código.
 */
export function templatesEnabled(): boolean {
  return process.env.WHATSAPP_TEMPLATES_ENABLED === 'true';
}

/**
 * Envía notificaciones WhatsApp al cliente vía el WhatsAppProvider activo
 * (Kapso/Mock según env) en las transiciones de un pedido web (solo
 * WEB_PICKUP). Idempotente por los flags notified_* de Sale. NUNCA lanza: un
 * fallo de WhatsApp no debe tumbar la transición de negocio (el caller la
 * llama fire-and-forget).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly businessName = process.env.BUSINESS_NAME ?? 'Tercos';
  private readonly addressShort = process.env.BUSINESS_ADDRESS_SHORT ?? null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly wa: WhatsAppProvider,
  ) {}

  async notify(saleId: string, stage: WhatsAppNotificationStage): Promise<void> {
    try {
      const sale = await this.prisma.sale.findUnique({
        where: { id: saleId },
        select: {
          id: true,
          receiptNumber: true,
          customerName: true,
          customerPhone: true,
          total: true,
          type: true,
          deliveryAddress: true,
          notified_payment_instructions: true,
          notified_payment_received: true,
          notified_ready_for_pickup: true,
          notified_canceled: true,
        },
      });
      // Los dos tipos web se notifican. COUNTER no: el cliente está en el mostrador.
      if (!sale || sale.type === 'COUNTER' || !sale.customerPhone) return;
      if (this.alreadySent(sale, stage)) return;

      // Claim atómico del flag ANTES de enviar: si dos notify() concurrentes
      // entran para el mismo (sale, stage) — reintento de red + sweep, doble
      // disparo — solo uno gana el updateMany condicionado; el otro sale sin
      // reenviar. Previene el doble mensaje al cliente. Si el envío falla
      // después, se libera el flag para permitir reintento.
      const claim = await this.prisma.sale.updateMany({
        where: { id: sale.id, ...this.flagPatch(stage, false) },
        data: this.flagPatch(stage, true),
      });
      if (claim.count === 0) return;

      const snapshot: WhatsAppSaleSnapshot = {
        receiptNumber: Number(sale.receiptNumber),
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        total: Number(sale.total),
        // Presente ⇒ el mensaje de "listo" dice "va en camino", no "retirar".
        deliveryAddress: sale.deliveryAddress,
      };
      const msgOpts = {
        businessName: this.businessName,
        businessAddressShort: this.addressShort,
        paymentInstructions:
          stage === 'payment_instructions' ? this.paymentInstructions() : null,
      };
      // El texto humano SIEMPRE se arma: es el fallback de sendText y lo que
      // queda auditado en whatsapp_messages (aunque el envío vaya por template).
      const text = buildNotificationMessage(stage, snapshot, msgOpts);

      let result: Awaited<ReturnType<WhatsAppProvider['sendText']>>;
      try {
        // Producción con Cloud API: business-initiated fuera de la ventana de
        // 24h SOLO llega por template pre-aprobado. Con el flag apagado
        // (sandbox/dev) va como texto libre.
        if (templatesEnabled() && this.wa.sendTemplate) {
          const template = buildNotificationTemplate(
            stage,
            snapshot,
            msgOpts,
            process.env.WHATSAPP_TEMPLATE_LANG ?? WHATSAPP_TEMPLATE_LANG_DEFAULT,
          );
          result = await this.wa.sendTemplate(sale.customerPhone, template);
        } else {
          result = await this.wa.sendText(sale.customerPhone, text);
        }
      } catch (err) {
        // El provider lanzó: liberar el claim para que un reintento futuro
        // pueda volver a enviar, y propagar al catch externo (log + no-throw).
        await this.releaseFlag(sale.id, stage);
        throw err;
      }

      await this.prisma.whatsAppMessage.create({
        data: {
          saleId: sale.id,
          stage,
          toPhone: sale.customerPhone,
          body: text,
          status: result.ok ? 'sent' : 'failed',
          providerMessageId: result.providerMessageId ?? null,
          error: result.error ?? null,
        },
      });

      if (!result.ok) {
        await this.releaseFlag(sale.id, stage);
        this.logger.warn(`WhatsApp ${stage} falló (sale ${sale.id}): ${result.error}`);
      }
    } catch (err) {
      this.logger.error(
        `notify(${stage}) error sale ${saleId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private alreadySent(
    sale: {
      notified_payment_instructions: boolean;
      notified_payment_received: boolean;
      notified_ready_for_pickup: boolean;
      notified_canceled: boolean;
    },
    stage: WhatsAppNotificationStage,
  ): boolean {
    switch (stage) {
      case 'payment_instructions':
        return sale.notified_payment_instructions;
      case 'payment_received':
        return sale.notified_payment_received;
      case 'pickup_ready':
        return sale.notified_ready_for_pickup;
      case 'canceled':
        return sale.notified_canceled;
    }
  }

  /** Patch del flag notified_* del stage, con el valor dado (claim=true, release=false). */
  private flagPatch(stage: WhatsAppNotificationStage, value: boolean) {
    switch (stage) {
      case 'payment_instructions':
        return { notified_payment_instructions: value };
      case 'payment_received':
        return { notified_payment_received: value };
      case 'pickup_ready':
        return { notified_ready_for_pickup: value };
      case 'canceled':
        return { notified_canceled: value };
    }
  }

  /** Libera el claim del flag para permitir un reintento posterior tras un fallo de envío. */
  private async releaseFlag(saleId: string, stage: WhatsAppNotificationStage): Promise<void> {
    await this.prisma.sale.update({
      where: { id: saleId },
      data: this.flagPatch(stage, false),
    });
  }

  /**
   * Reintento de envíos FALLIDOS (informe de calidad A3): un `pickup_ready`
   * que falló es un stage TERMINAL — nada vuelve a dispararlo y el cliente
   * queda esperando para siempre. Este cron barre los `failed` de las últimas
   * 24h y re-dispara `notify` (que es idempotente por flag: si un intento
   * posterior ya salió, el flag está en true y no reenvía). Tope de 5 intentos
   * por (venta, stage) para no martillar un número inválido eternamente.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedMessages(): Promise<void> {
    if (this.retrying) return;
    this.retrying = true;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const failed = await this.prisma.whatsAppMessage.findMany({
        where: { status: 'failed', createdAt: { gte: since } },
        select: { saleId: true, stage: true },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      const seen = new Set<string>();
      for (const f of failed) {
        if (!f.saleId) continue;
        const key = `${f.saleId}:${f.stage}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const attempts = await this.prisma.whatsAppMessage.count({
          where: { saleId: f.saleId, stage: f.stage },
        });
        if (attempts >= 5) continue;
        // Si ya hay un envío exitoso posterior, notify() sale por el flag.
        await this.notify(f.saleId, f.stage as WhatsAppNotificationStage);
      }
    } catch (err) {
      this.logger.error(
        `retryFailedMessages error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.retrying = false;
    }
  }

  private retrying = false;

  /**
   * Retención de PII: los mensajes guardan teléfono + cuerpo (nombre/total del
   * cliente) en claro. Se purgan a los 90 días — auditoría de envíos a corto
   * plazo sin acumular datos personales indefinidamente (Ley 1581 Habeas Data).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldMessages(): Promise<void> {
    const cutoff = new Date(Date.now() - WHATSAPP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.whatsAppMessage.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) this.logger.log(`Purgados ${count} whatsapp_messages > ${WHATSAPP_RETENTION_DAYS}d`);
    } catch (err) {
      this.logger.error(
        `purgeOldMessages error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private paymentInstructions(): string | null {
    const parts = [
      process.env.PAYMENT_INSTRUCTIONS_NEQUI,
      process.env.PAYMENT_INSTRUCTIONS_TRANSFER,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length ? parts.join('\n') : null;
  }
}
