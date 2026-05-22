/**
 * Abre el cajón monedero asociado a una venta CASH ya pagada.
 * No requiere PIN (hay venta confirmada). Para apertura sin venta
 * existe un flujo aparte con X-Approval-Pin.
 */
export async function openDrawerForSale(saleId: string): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/open-drawer`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}
