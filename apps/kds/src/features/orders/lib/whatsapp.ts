import {
  buildLinkForStage,
  type WhatsAppSaleSnapshot,
} from '@pos-tercos/domain';
import type { Sale } from '@pos-tercos/types';
import { z } from 'zod';

const BUSINESS_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'Tercos';
const BUSINESS_ADDRESS_SHORT =
  process.env.NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT ?? null;

const ResponseSchema = z.object({ recorded: z.literal(true) });

/**
 * Acoplado al click "Marcar listo" del cocinero. Solo aplica a sales
 * WEB_PICKUP/WEB_DELIVERY (COUNTER no notifica al cliente).
 *
 * Diseño: NO bloquea la transición de status. Si el LLM pop-up es
 * bloqueado o el sale no tiene phone, la transición YA pasó (status =
 * LISTO_DESPACHO) y el cliente lo verá en su /checkout/success poller.
 */
export function openWhatsAppReady(sale: Sale): void {
  if (sale.type !== 'WEB_PICKUP' && sale.type !== 'WEB_DELIVERY') return;
  const snapshot: WhatsAppSaleSnapshot = {
    receiptNumber: sale.receiptNumber,
    customerName: sale.customerName ?? null,
    customerPhone: sale.customerPhone ?? null,
    total: Number(sale.total),
    type: sale.type,
  };
  const link = buildLinkForStage('ready', snapshot, {
    businessName: BUSINESS_NAME,
    businessAddressShort: BUSINESS_ADDRESS_SHORT,
  });
  if (!link) return; // sin phone

  // Audit fire-and-forget.
  fetch(`/api/sales/${sale.id}/whatsapp-clicked`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'ready' }),
  })
    .then((res) => res.json())
    .then((j) => ResponseSchema.parse(j))
    .catch(() => {
      console.warn('whatsapp-clicked audit failed (kds, ready)');
    });

  window.open(link.url, '_blank', 'noopener,noreferrer');
}
