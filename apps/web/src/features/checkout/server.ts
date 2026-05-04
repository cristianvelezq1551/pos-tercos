import {
  PublicWebOrderSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { publicFetch } from '../../lib/api-server';

export async function getWebOrderServer(
  saleId: string,
  token: string,
): Promise<PublicWebOrder | null> {
  const json = await publicFetch<unknown>(
    `/web/orders/${saleId}?token=${encodeURIComponent(token)}`,
  );
  if (json === null) return null;
  const parsed = PublicWebOrderSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Construye el texto de instrucciones de pago. Espeja la lógica del backend
 * (apps/api/src/web-orders/web-orders.controller.ts:buildPaymentInstructions)
 * para que el cliente que llega al success URL fresco — sin pasar por el
 * POST inicial — vea instrucciones consistentes.
 */
export function buildPaymentInstructions(order: PublicWebOrder): string {
  const nequi = process.env.NEXT_PUBLIC_PAYMENT_NEQUI ?? '';
  const transfer = process.env.NEXT_PUBLIC_PAYMENT_TRANSFER ?? '';
  const total = order.total.toLocaleString('es-CO');
  const lines: string[] = [`Total a pagar: $${total}`, '', 'Métodos disponibles:'];
  if (nequi) lines.push(`• Nequi: ${nequi}`);
  if (transfer) lines.push(`• Transferencia: ${transfer}`);
  if (!nequi && !transfer) {
    lines.push('• Pedile al local los datos de pago (config NEXT_PUBLIC_PAYMENT_* pendiente).');
  }
  lines.push('');
  lines.push(
    `Cuando termines el pago, hacé click en "Ya pagué". Tu orden #${order.receiptNumber} se enviará a cocina apenas el cajero verifique.`,
  );
  return lines.join('\n');
}
