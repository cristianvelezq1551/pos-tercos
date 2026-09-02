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
import { quitarComprobante, subirComprobantes } from '../../../lib/comprobantes';

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
  proofs: File[],
): Promise<PayableCommitment> {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(input));
  for (const f of proofs) fd.append('proof', await prepararFoto(f, 'payable-proof'));
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

export function payableProofUrl(id: string, index = 0): string {
  // El primero conserva la ruta de siempre (ver invoicePaymentProofUrl).
  return index === 0 ? `/api/payables/${id}/proof` : `/api/payables/${id}/proof/${index}`;
}

/** Suma comprobantes a un compromiso ya pagado. */
export function addPayableProofs(id: string, files: File[]): Promise<PayableCommitment> {
  return subirComprobantes(`/payables/${id}/proofs`, files, PayableCommitmentSchema);
}

export function removePayableProof(id: string, index: number): Promise<PayableCommitment> {
  return quitarComprobante(`/payables/${id}/proofs/${index}`, PayableCommitmentSchema);
}
