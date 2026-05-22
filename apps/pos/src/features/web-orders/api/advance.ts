/**
 * El cajero avanza un pedido web en la cocina (cuando el cocinero está
 * ocupado). Reusa los endpoints del KDS, ahora accesibles para el cajero.
 * `silent` (actualización retroactiva offline) evita avisar al cliente.
 */
export async function startWebOrder(saleId: string): Promise<void> {
  const res = await fetch(`/api/kds/orders/${saleId}/start`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}

export async function markWebOrderReady(
  saleId: string,
  silent: boolean,
): Promise<void> {
  const qs = silent ? '?silent=true' : '';
  const res = await fetch(`/api/kds/orders/${saleId}/ready${qs}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}
