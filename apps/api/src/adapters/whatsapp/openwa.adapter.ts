import { Logger } from '@nestjs/common';
import type { WhatsAppProvider, WhatsAppSendResult } from '@pos-tercos/domain';

/**
 * Envía mensajes vía OpenWA (gateway self-hosted, whatsapp-web.js).
 * `POST {OPENWA_URL}/api/sessions/{OPENWA_SESSION_ID}/messages/send-text`
 * con header `X-API-Key`. Nunca lanza: devuelve { ok:false, error } para
 * que el NotificationService no tumbe la transición de negocio.
 *
 * Vars: OPENWA_URL, OPENWA_API_KEY, OPENWA_SESSION_ID. El constructor
 * valida que existan (el factory del módulo solo lo instancia si están).
 */
export class OpenWaWhatsAppAdapter implements WhatsAppProvider {
  private readonly logger = new Logger(OpenWaWhatsAppAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly sessionId: string;

  constructor() {
    const baseUrl = process.env.OPENWA_URL;
    const apiKey = process.env.OPENWA_API_KEY;
    const sessionId = process.env.OPENWA_SESSION_ID;
    if (!baseUrl || !apiKey || !sessionId) {
      throw new Error(
        'OpenWaWhatsAppAdapter requiere OPENWA_URL, OPENWA_API_KEY y OPENWA_SESSION_ID',
      );
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.sessionId = sessionId;
  }

  async sendText(phoneE164: string, text: string): Promise<WhatsAppSendResult> {
    const chatId = toChatId(phoneE164);
    if (!chatId) return { ok: false, error: `phone inválido: ${phoneE164}` };

    try {
      const res = await fetch(
        `${this.baseUrl}/api/sessions/${this.sessionId}/messages/send-text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
          body: JSON.stringify({ chatId, text }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `OpenWA HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const json = (await res.json().catch(() => null)) as {
        data?: { messageId?: string };
      } | null;
      return { ok: true, providerMessageId: json?.data?.messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn(`send-text falló para ${chatId}: ${error}`);
      return { ok: false, error };
    }
  }
}

/** Phone E.164 colombiano (+57XXXXXXXXXX) → chatId OpenWA (57XXXXXXXXXX@c.us). */
function toChatId(phoneE164: string): string | null {
  const digits = phoneE164.replace(/\D+/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.length === 10 ? `57${digits}` : digits;
  return `${withCountry}@c.us`;
}
