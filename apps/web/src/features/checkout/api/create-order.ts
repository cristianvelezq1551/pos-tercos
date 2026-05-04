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
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return CreateWebOrderResponseSchema.parse(json);
}
