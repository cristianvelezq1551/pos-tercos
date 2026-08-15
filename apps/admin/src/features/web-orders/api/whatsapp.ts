import {
  ManualWhatsAppLinkSchema,
  type ManualWhatsAppLink,
  type WhatsAppNotificationStageCode,
} from '@pos-tercos/types';

/**
 * Pide el link `wa.me` para avisarle al cliente y deja registrado el aviso.
 * El texto lo arma el server (misma fuente que el envío automático).
 */
export async function requestWhatsAppLink(
  saleId: string,
  stage: WhatsAppNotificationStageCode,
  opts: { force?: boolean } = {},
): Promise<ManualWhatsAppLink> {
  const qs = opts.force ? '?force=true' : '';
  const res = await fetch(`/api/sales/${saleId}/whatsapp/${stage}${qs}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return ManualWhatsAppLinkSchema.parse(await res.json());
}
