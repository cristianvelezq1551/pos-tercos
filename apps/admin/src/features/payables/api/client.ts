import {
  CreatePayableSchema,
  PayableCommitmentSchema,
  type CreatePayable,
  type PayableCommitment,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request, validateInput } from '../../../lib/api-client';
import { randomUUID } from '../../../lib/uuid';
import { prepararFoto } from '../../../lib/subir-archivo';

const PayableListSchema = z.array(PayableCommitmentSchema);

export function listPayables(): Promise<PayableCommitment[]> {
  return request('/payables', { method: 'GET' }, PayableListSchema);
}

export function createPayable(input: CreatePayable): Promise<PayableCommitment> {
  validateInput(CreatePayableSchema, input);
  return request('/payables', { method: 'POST', body: JSON.stringify(input) }, PayableCommitmentSchema);
}

export async function payPayable(
  id: string,
  input: { cashAmount: number; bankAmount: number; note?: string },
  proof: File | null,
): Promise<PayableCommitment> {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(input));
  if (proof) fd.append('proof', await prepararFoto(proof, 'payable-proof'));
  const res = await fetch(`/api/payables/${id}/pay`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
    headers: { 'Idempotency-Key': randomUUID() },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return PayableCommitmentSchema.parse((await res.json()) as unknown);
}

export async function cancelPayable(id: string): Promise<void> {
  const res = await fetch(`/api/payables/${id}/cancel`, { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
}

export function payableProofUrl(id: string): string {
  return `/api/payables/${id}/proof`;
}
