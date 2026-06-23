import { AuditLogEntrySchema, type AuditLogEntry } from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const AuditListSchema = z.array(AuditLogEntrySchema);

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
