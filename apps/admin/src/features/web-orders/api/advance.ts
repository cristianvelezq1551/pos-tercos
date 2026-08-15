async function advance(saleId: string, action: 'mark-ready' | 'mark-delivered'): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}

/**
 * El cajero marca un pedido WEB pagado como listo. Dispara el WhatsApp
 * `pickup_ready` al cliente. En RECOGER es el estado final; en DOMICILIO
 * significa "salió hacia la dirección" y todavía falta marcarlo entregado.
 */
export async function markWebOrderReady(saleId: string): Promise<void> {
  return advance(saleId, 'mark-ready');
}

/** Cierra el ciclo de un domicilio: llegó. Sin WhatsApp (el cliente ya comió). */
export async function markWebOrderDelivered(saleId: string): Promise<void> {
  return advance(saleId, 'mark-delivered');
}
