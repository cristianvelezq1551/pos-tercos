import {
  CortesiaGivenSummarySchema,
  CortesiaRequestSchema,
  type CortesiaGivenSummary,
  type CortesiaRequest,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const ListSchema = z.array(CortesiaRequestSchema);

export function listCortesias(status?: string): Promise<CortesiaRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/cortesias${qs}`, { method: 'GET' }, ListSchema);
}

/** Total dado en cortesías del mes actual (FIFO, igual al estado financiero). */
export function getCortesiaGivenSummary(): Promise<CortesiaGivenSummary> {
  return request('/cortesias/given-summary', { method: 'GET' }, CortesiaGivenSummarySchema);
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
