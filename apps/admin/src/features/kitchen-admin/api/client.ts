import {
  ChecklistItemSchema,
  KitchenIncidentSchema,
  type ChecklistItem,
  type ChecklistType,
  type CreateChecklistItem,
  type KitchenIncident,
  type UpdateChecklistItem,
} from '@pos-tercos/types';
import { z } from 'zod';

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw await toError(res);
  return schema.parse(await res.json());
}

async function send<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Client-App': 'admin' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  return schema.parse(await res.json());
}

async function toError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return new Error(body?.message ?? `Error ${res.status}`);
}

export function listIncidents(onlyOpen = false): Promise<KitchenIncident[]> {
  return get(`/kitchen/incidents${onlyOpen ? '?only_open=true' : ''}`, z.array(KitchenIncidentSchema));
}

export function resolveIncident(id: string): Promise<KitchenIncident> {
  return send(`/kitchen/incidents/${id}/resolve`, undefined, KitchenIncidentSchema);
}

export function listChecklistItems(type?: ChecklistType): Promise<ChecklistItem[]> {
  return get(`/kitchen/checklist/items${type ? `?type=${type}` : ''}`, z.array(ChecklistItemSchema));
}

export function createChecklistItem(body: CreateChecklistItem): Promise<ChecklistItem> {
  return send('/kitchen/checklist/items', body, ChecklistItemSchema);
}

export function updateChecklistItem(id: string, body: UpdateChecklistItem): Promise<ChecklistItem> {
  return send(`/kitchen/checklist/items/${id}`, body, ChecklistItemSchema, 'PATCH');
}
