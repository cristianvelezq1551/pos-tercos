'use client';

import {
  CortesiaRequestSchema,
  type CortesiaRequest,
  type CreateCortesia,
} from '@pos-tercos/types';
import { z } from 'zod';
import { notifyCortesiaActivity } from '../lib/cortesia-events';

const ListSchema = z.array(CortesiaRequestSchema);

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
  const created = CortesiaRequestSchema.parse(await res.json());
  // Hay una cortesía en vuelo → el watcher empieza a vigilar su resolución.
  notifyCortesiaActivity();
  return created;
}

/** Cortesías del cajero actual (con su estado). */
export async function listMyCortesias(): Promise<CortesiaRequest[]> {
  const res = await fetch('/api/cortesias/mine', { credentials: 'include' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return ListSchema.parse(await res.json());
}

/** Marca como vista una cortesía observada. */
export async function ackCortesia(id: string): Promise<void> {
  const res = await fetch(`/api/cortesias/${id}/ack`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
}

/** Una cortesía "observada" (rechazada) que el cajero aún no acusó. */
export function isUnseenObserved(c: CortesiaRequest): boolean {
  return c.status === 'REJECTED' && !c.seenByRequester;
}

/** Cortesía resuelta (autorizada u observada) que el cajero aún no vio. */
export function isUnseenResolved(c: CortesiaRequest): boolean {
  return (c.status === 'APPROVED' || c.status === 'REJECTED') && !c.seenByRequester;
}
