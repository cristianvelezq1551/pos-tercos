import { Injectable, Logger } from '@nestjs/common';
import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
} from '@pos-tercos/domain';

/**
 * Dev: no envía nada real. Loggea el mensaje para inspección. Default cuando
 * no hay vars KAPSO ni OPENWA configuradas. Implementa también `sendTemplate`
 * para poder probar el branch de templates sin Kapso
 * (WHATSAPP_TEMPLATES_ENABLED=true en dev).
 */
@Injectable()
export class MockWhatsAppAdapter implements WhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppAdapter.name);

  async sendText(phoneE164: string, text: string): Promise<WhatsAppSendResult> {
    this.logger.log(`[MOCK WhatsApp → ${phoneE164}] ${text.replace(/\n/g, ' ⏎ ')}`);
    return { ok: true, providerMessageId: `mock-${Date.now()}` };
  }

  async sendTemplate(
    phoneE164: string,
    template: WhatsAppTemplateMessage,
  ): Promise<WhatsAppSendResult> {
    this.logger.log(
      `[MOCK WhatsApp TEMPLATE ${template.name}/${template.languageCode} → ${phoneE164}] ${template.variables.join(' · ')}`,
    );
    return { ok: true, providerMessageId: `mock-tpl-${Date.now()}` };
  }
}
