/**
 * Acciones de cocina disponibles para el cajero (endpoints /kds con
 * KitchenOrCashierAccess). Sirven para CUALQUIER pedido (mostrador o web),
 * no solo los web. La validación de estado la hace el backend (transición
 * exige el estado previo correcto).
 */

async function postKds(path: string): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Acción falló (${res.status})`);
  }
}

/** PAGADO → EN_PREPARACION. */
export function startKitchenOrder(saleId: string): Promise<void> {
  return postKds(`/kds/orders/${saleId}/start`);
}

/** EN_PREPARACION → LISTO_DESPACHO. */
export function markKitchenReady(saleId: string): Promise<void> {
  return postKds(`/kds/orders/${saleId}/ready`);
}
