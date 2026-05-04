import {
  buildLinkForStage,
  type WhatsAppSaleSnapshot,
  type WhatsAppStage,
} from '@pos-tercos/domain';
import type { PublicWebOrder, Sale } from '@pos-tercos/types';
import { recordWhatsAppClicked } from '../api/whatsapp';

const BUSINESS_NAME =
  process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'Tercos';
const BUSINESS_ADDRESS_SHORT =
  process.env.NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT ?? null;

export interface OpenWhatsAppResult {
  /** Si el wa.me se pudo abrir (popup blocker / phone faltante puede impedirlo). */
  opened: boolean;
  /** Razón si no se abrió. */
  reason?: 'no-phone' | 'popup-blocked' | 'not-web-sale';
}

type SaleLike = PublicWebOrder | Sale;

function toSnapshot(sale: SaleLike): WhatsAppSaleSnapshot | null {
  if (sale.type !== 'WEB_PICKUP' && sale.type !== 'WEB_DELIVERY') return null;
  return {
    receiptNumber: sale.receiptNumber,
    customerName: sale.customerName ?? null,
    customerPhone: sale.customerPhone ?? null,
    total: Number(sale.total),
    type: sale.type,
  };
}

/**
 * Abre wa.me en tab nueva (`window.open` con noopener) y registra el
 * click en backend (audit). Diseñado para ser llamado en respuesta a un
 * user gesture (click handler) — si se llama fuera de eso, popup blocker
 * cierra la tab.
 *
 * Robusto a fallos: si el backend audit falla, igual abre wa.me; si
 * wa.me falla por popup, devuelve {opened:false} y el caller puede
 * mostrar un mensaje al cajero ("permití popups para esta página").
 */
export function openWhatsAppForSale(
  sale: SaleLike,
  stage: WhatsAppStage,
): OpenWhatsAppResult {
  const snapshot = toSnapshot(sale);
  if (!snapshot) return { opened: false, reason: 'not-web-sale' };

  const link = buildLinkForStage(stage, snapshot, {
    businessName: BUSINESS_NAME,
    businessAddressShort: BUSINESS_ADDRESS_SHORT,
  });
  if (!link) return { opened: false, reason: 'no-phone' };

  // Audit fire-and-forget. Nunca bloquea la apertura del wa.me.
  recordWhatsAppClicked(sale.id, stage).catch(() => {
    // eslint-disable-next-line no-console
    console.warn('whatsapp-clicked audit failed for', sale.id, stage);
  });

  // window.open desde un click handler no debería ser bloqueado.
  const win = window.open(link.url, '_blank', 'noopener,noreferrer');
  if (!win) return { opened: false, reason: 'popup-blocked' };
  return { opened: true };
}
