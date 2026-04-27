import { AuditLogEntrySchema, type AuditLogEntry } from '@pos-tercos/types';
import { z } from 'zod';

const AuditListSchema = z.array(AuditLogEntrySchema);

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: init.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

export function listAudit(filter: {
  action?: string;
  userId?: string;
  entityType?: string;
  limit?: number;
} = {}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (filter.action) params.set('action', filter.action);
  if (filter.userId) params.set('user_id', filter.userId);
  if (filter.entityType) params.set('entity_type', filter.entityType);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request(`/audit${qs}`, { method: 'GET' }, AuditListSchema);
}
