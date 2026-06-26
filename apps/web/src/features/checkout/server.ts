import {
  PublicWebOrderSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { publicFetchResult } from '../../lib/api-server';

/**
 * Resultado de cargar una orden pública. Distingue los modos de falla para que
 * la página muestre el mensaje correcto en vez de un 404 genérico:
 *  - `not_found`: la orden no existe (404).
 *  - `expired`: el token venció o no es válido (401/403/410) — el enlace de 24h.
 *  - `error`: red caída o 5xx del backend — reintentable.
 */
export type WebOrderResult =
  | { ok: true; order: PublicWebOrder }
  | { ok: false; reason: 'not_found' | 'expired' | 'error' };

export async function getWebOrderServer(
  saleId: string,
  token: string,
): Promise<WebOrderResult> {
  const res = await publicFetchResult<unknown>(
    `/web/orders/${saleId}?token=${encodeURIComponent(token)}`,
  );
  if (res.ok) {
    const parsed = PublicWebOrderSchema.safeParse(res.data);
    return parsed.success
      ? { ok: true, order: parsed.data }
      : { ok: false, reason: 'error' };
  }
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if ([401, 403, 410].includes(res.status)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: false, reason: 'error' };
}
