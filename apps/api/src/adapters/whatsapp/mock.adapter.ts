import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppProvider, WhatsAppSendResult } from '@pos-tercos/domain';

/**
 * Dev: no envía nada real. Loggea el mensaje para inspección. Default
 * cuando no hay OPENWA_* configurado.
 */
@Injectable()
export class MockWhatsAppAdapter implements WhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppAdapter.name);

  async sendText(phoneE164: string, text: string): Promise<WhatsAppSendResult> {
    this.logger.log(`[MOCK WhatsApp → ${phoneE164}] ${text.replace(/\n/g, ' ⏎ ')}`);
    return { ok: true, providerMessageId: `mock-${Date.now()}` };
  }
}
