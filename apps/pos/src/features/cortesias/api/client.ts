'use client';

import {
  CortesiaRequestSchema,
  type CortesiaRequest,
  type CreateCortesia,
} from '@pos-tercos/types';

/** El cajero solicita una cortesía (queda PENDING para que un admin la confirme). */
export async function createCortesia(input: CreateCortesia): Promise<CortesiaRequest> {
  const res = await fetch('/api/cortesias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return CortesiaRequestSchema.parse(await res.json());
}
