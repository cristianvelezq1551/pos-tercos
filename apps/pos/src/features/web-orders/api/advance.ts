/**
 * El cajero marca un pedido WEB pagado como "listo para retirar". Dispara el
 * WhatsApp `pickup_ready` al cliente (LISTO_DESPACHO es el estado final del
 * pedido web — no hay cocina/KDS ni seguimiento de entrega).
 */
export async function markWebOrderReady(saleId: string): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/mark-ready`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}
