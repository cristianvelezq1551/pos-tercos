/** Rechaza un pedido web pendiente (cajero). Transiciona a CANCELADO_NO_PAGO
 *  y el backend avisa al cliente por WhatsApp. */
export async function cancelWebOrder(saleId: string): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}
