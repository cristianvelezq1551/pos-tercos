import { Logger } from '@nestjs/common';
import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
} from '@pos-tercos/domain';

/** Corta el fetch si Kapso no responde — un request colgado no debe fijar el worker. */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Envía mensajes vía Kapso (wrapper oficial sobre la WhatsApp Cloud API de
 * Meta). `POST {KAPSO_BASE_URL}/{KAPSO_PHONE_NUMBER_ID}/messages` con header
 * `X-API-Key`. El body es el shape estándar de la Cloud API. Nunca lanza:
 * devuelve { ok:false, error } para que NotificationService no tumbe la
 * transición de negocio.
 *
 * `sendText` solo se entrega dentro de la ventana de 24h (cliente escribió
 * primero) o en el sandbox de Kapso. Para el primer contacto business-initiated
 * en producción hace falta un template (Fase B) — ver kapso-setup.md.
 *
 * OJO semántica de `ok:true`: la Cloud API responde 200 cuando ACEPTA el
 * mensaje, no cuando lo entrega (entregas/fallos async van por webhooks, que
 * no consumimos). `whatsapp_messages.status='sent'` = aceptado por la API.
 *
 * Vars: KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID. Opcional KAPSO_BASE_URL
 * (default api.kapso.ai). El constructor valida que existan (el factory del
 * módulo solo lo instancia si están).
 */
export class KapsoWhatsAppAdapter implements WhatsAppProvider {
  private readonly logger = new Logger(KapsoWhatsAppAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly phoneNumberId: string;

  constructor() {
    const apiKey = process.env.KAPSO_API_KEY;
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
    if (!apiKey || !phoneNumberId) {
      throw new Error(
        'KapsoWhatsAppAdapter requiere KAPSO_API_KEY y KAPSO_PHONE_NUMBER_ID',
      );
    }
    this.apiKey = apiKey;
    this.phoneNumberId = phoneNumberId;
    this.baseUrl = (
      process.env.KAPSO_BASE_URL ?? 'https://api.kapso.ai/meta/whatsapp/v24.0'
    ).replace(/\/+$/, '');
  }

  async sendText(phoneE164: string, text: string): Promise<WhatsAppSendResult> {
    const to = toRecipient(phoneE164);
    if (!to) return { ok: false, error: `phone inválido: ${phoneE164}` };
    return this.post(to, { type: 'text', text: { body: text } });
  }

  /**
   * Mensaje por TEMPLATE pre-aprobado (obligatorio para business-initiated
   * fuera de la ventana de 24h). Shape estándar de la Cloud API:
   * `template.components[0].parameters` llena {{1}}..{{n}} en orden.
   */
  async sendTemplate(
    phoneE164: string,
    template: WhatsAppTemplateMessage,
  ): Promise<WhatsAppSendResult> {
    const to = toRecipient(phoneE164);
    if (!to) return { ok: false, error: `phone inválido: ${phoneE164}` };
    return this.post(to, {
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.languageCode },
        components:
          template.variables.length > 0
            ? [
                {
                  type: 'body',
                  parameters: template.variables.map((text) => ({ type: 'text', text })),
                },
              ]
            : [],
      },
    });
  }

  private async post(
    to: string,
    payload: Record<string, unknown>,
  ): Promise<WhatsAppSendResult> {
    try {
      const res = await fetch(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
          body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `Kapso HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const json = (await res.json().catch(() => null)) as {
        messages?: { id?: string }[];
      } | null;
      return { ok: true, providerMessageId: json?.messages?.[0]?.id };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn(`send falló para ${to}: ${error}`);
      return { ok: false, error };
    }
  }
}

/** Phone E.164 colombiano (+57XXXXXXXXXX) → dígitos sin `+` (57XXXXXXXXXX). */
function toRecipient(phoneE164: string): string | null {
  const digits = phoneE164.replace(/\D+/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `57${digits}` : digits;
}
