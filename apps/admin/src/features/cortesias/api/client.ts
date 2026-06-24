import { CortesiaRequestSchema, type CortesiaRequest } from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const ListSchema = z.array(CortesiaRequestSchema);

export function listCortesias(status?: string): Promise<CortesiaRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/cortesias${qs}`, { method: 'GET' }, ListSchema);
}

export function approveCortesia(id: string, note?: string): Promise<CortesiaRequest> {
  return request(
    `/cortesias/${id}/approve`,
    { method: 'POST', body: JSON.stringify({ note }) },
    CortesiaRequestSchema,
  );
}

export function rejectCortesia(id: string, note?: string): Promise<CortesiaRequest> {
  return request(
    `/cortesias/${id}/reject`,
    { method: 'POST', body: JSON.stringify({ note }) },
    CortesiaRequestSchema,
  );
}
