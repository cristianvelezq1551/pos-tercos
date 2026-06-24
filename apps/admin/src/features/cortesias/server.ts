import { CortesiaRequestSchema, type CortesiaRequest } from '@pos-tercos/types';
import { z } from 'zod';
import { serverFetchJson } from '../../lib/api-server';

export function getCortesiasServer(status?: string): Promise<CortesiaRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return serverFetchJson<CortesiaRequest[]>(
    `/cortesias${qs}`,
    undefined,
    z.array(CortesiaRequestSchema),
  );
}
