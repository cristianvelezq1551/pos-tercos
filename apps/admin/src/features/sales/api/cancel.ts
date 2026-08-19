/** Cancela una venta PENDIENTE_PAGO (cobro abandonado en el mostrador). */
export async function cancelSale(saleId: string): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `cancelSale failed: ${res.status}`);
  }
}
