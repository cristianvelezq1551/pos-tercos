import {
  CreateWebOrderResponseSchema,
  IDEMPOTENCY_HEADER,
  type CreateWebOrder,
  type CreateWebOrderResponse,
} from '@pos-tercos/types';

export async function createWebOrder(
  input: CreateWebOrder,
  idempotencyKey: string,
): Promise<CreateWebOrderResponse> {
  const res = await fetch('/api/web/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(friendlyOrderError(res.status, body?.message));
  }
  const json = (await res.json()) as unknown;
  return CreateWebOrderResponseSchema.parse(json);
}

/**
 * §3.5: traduce los errores genéricos del backend a algo que el cliente entienda.
 * Los mensajes de NEGOCIO (radio, horario, kill-switch, límite 3/día) ya vienen
 * en español y claros → se respetan tal cual. Solo se reemplazan los técnicos.
 */
function friendlyOrderError(status: number, raw?: string): string {
  if (status === 429) {
    return 'Estamos recibiendo muchos pedidos. Espera unos segundos y vuelve a intentar.';
  }
  const msg = (raw ?? '').trim();
  if (/validation failed|invalid|too_big|demasiado/i.test(msg)) {
    return 'Revisa los datos del pedido: algún campo es inválido o el carrito es muy grande.';
  }
  if (/not found/i.test(msg)) {
    return 'Un producto de tu carrito ya no está disponible. Vuelve al menú y arma el pedido de nuevo.';
  }
  return msg || `No se pudo crear el pedido (error ${status}).`;
}
