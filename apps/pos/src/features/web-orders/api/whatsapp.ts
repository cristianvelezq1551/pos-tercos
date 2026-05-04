import { z } from 'zod';

const WhatsAppClickedResponseSchema = z.object({ recorded: z.literal(true) });

export type WhatsAppStage = 'accepted' | 'confirmed' | 'ready';

/**
 * Registra el click en backend (audit only). El backend NO envía nada;
 * la apertura de wa.me la hace el browser via `openWhatsAppLink`. Esta
 * llamada es fire-and-forget desde la UI: si falla, igual queremos que
 * el operador siga con el flujo (la transición de status es lo que
 * importa, el audit es nice-to-have).
 */
export async function recordWhatsAppClicked(
  saleId: string,
  stage: WhatsAppStage,
): Promise<{ recorded: true }> {
  const res = await fetch(`/api/sales/${saleId}/whatsapp-clicked`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return WhatsAppClickedResponseSchema.parse(json);
}
