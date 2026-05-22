import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  buildNotificationMessage,
  type WhatsAppNotificationStage,
  type WhatsAppProvider,
  type WhatsAppSaleSnapshot,
} from '@pos-tercos/domain';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Envía notificaciones WhatsApp al cliente vía OpenWA en las transiciones
 * de un pedido web (solo WEB_PICKUP). Idempotente por los flags notified_*
 * de Sale. NUNCA lanza: un fallo de WhatsApp no debe tumbar la transición
 * de negocio (el caller la llama fire-and-forget).
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
          notified_payment_instructions: true,
          notified_payment_received: true,
          notified_ready_for_pickup: true,
          notified_canceled: true,
        },
      });
      if (!sale || sale.type !== 'WEB_PICKUP' || !sale.customerPhone) return;
      if (this.alreadySent(sale, stage)) return;

      const snapshot: WhatsAppSaleSnapshot = {
        receiptNumber: Number(sale.receiptNumber),
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        total: Number(sale.total),
      };
      const text = buildNotificationMessage(stage, snapshot, {
        businessName: this.businessName,
        businessAddressShort: this.addressShort,
        paymentInstructions:
          stage === 'payment_instructions' ? this.paymentInstructions() : null,
      });

      const result = await this.wa.sendText(sale.customerPhone, text);

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

      if (result.ok) {
        await this.prisma.sale.update({
          where: { id: sale.id },
          data: this.flagData(stage),
        });
      } else {
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

  private flagData(stage: WhatsAppNotificationStage) {
    switch (stage) {
      case 'payment_instructions':
        return { notified_payment_instructions: true };
      case 'payment_received':
        return { notified_payment_received: true };
      case 'pickup_ready':
        return { notified_ready_for_pickup: true };
      case 'canceled':
        return { notified_canceled: true };
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
