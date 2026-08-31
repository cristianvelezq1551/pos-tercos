import {
  PushSendOutcomeSchema,
  PushStatusSchema,
  type PushSendOutcome,
  type PushStatus,
  type PushSubscriptionInput,
} from '@pos-tercos/types';

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? `Error ${res.status}`;
}

export async function getPushStatus(endpoint?: string): Promise<PushStatus> {
  const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  const res = await fetch(`/api/push/status${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return PushStatusSchema.parse(await res.json());
}

export async function savePushSubscription(input: PushSubscriptionInput): Promise<void> {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const res = await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function sendPushTest(): Promise<PushSendOutcome> {
  const res = await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return PushSendOutcomeSchema.parse(await res.json());
}
