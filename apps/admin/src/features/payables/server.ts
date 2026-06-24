import { PayableCommitmentSchema, type PayableCommitment } from '@pos-tercos/types';
import { z } from 'zod';
import { serverFetchJson } from '../../lib/api-server';

export function getPayablesServer(): Promise<PayableCommitment[]> {
  return serverFetchJson<PayableCommitment[]>(
    '/payables',
    undefined,
    z.array(PayableCommitmentSchema),
  );
}
