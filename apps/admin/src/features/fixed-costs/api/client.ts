import {
  CreateFixedCostSchema,
  FinancePaidFixedCostSchema,
  FixedCostSchema,
  UpdateFixedCostSchema,
  type CreateFixedCost,
  type FinancePaidFixedCost,
  type FixedCost,
  type UpdateFixedCost,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const FixedCostListSchema = z.array(FixedCostSchema);

export function listFixedCosts(opts: { onlyActive?: boolean } = {}): Promise<FixedCost[]> {
  const qs = opts.onlyActive ? '?only_active=true' : '';
  return request(`/fixed-costs${qs}`, { method: 'GET' }, FixedCostListSchema);
}

export function getFixedCost(id: string): Promise<FixedCost> {
  return request(`/fixed-costs/${id}`, { method: 'GET' }, FixedCostSchema);
}

export function createFixedCost(input: CreateFixedCost): Promise<FixedCost> {
  CreateFixedCostSchema.parse(input);
  return request('/fixed-costs', { method: 'POST', body: JSON.stringify(input) }, FixedCostSchema);
}

export function updateFixedCost(id: string, input: UpdateFixedCost): Promise<FixedCost> {
  UpdateFixedCostSchema.parse(input);
  return request(
    `/fixed-costs/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    FixedCostSchema,
  );
}

export async function deleteFixedCost(id: string): Promise<void> {
  const res = await fetch(`/api/fixed-costs/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
}

// ====================================================================
// PAGO MENSUAL DEL COSTO FIJO (Dueño + PIN)
// ====================================================================

function pinHeader(pin: string): Record<string, string> {
  return { 'X-Approval-Pin': pin };
}

/** Marca pagado un costo fijo para (año, mes) con comprobante. */
export async function markFixedCostPaid(
  fixedCostId: string,
  proof: File,
  pin: string,
  body: { periodYear: number; periodMonth: number; paidAt?: string; amount?: number; note?: string },
): Promise<FinancePaidFixedCost> {
  const fd = new FormData();
  fd.append('proof', proof);
  fd.append('periodYear', String(body.periodYear));
  fd.append('periodMonth', String(body.periodMonth));
  if (body.paidAt) fd.append('paidAt', body.paidAt);
  if (body.amount !== undefined) fd.append('amount', String(body.amount));
  if (body.note) fd.append('note', body.note);
  const res = await fetch(`/api/fixed-costs/${fixedCostId}/payment`, {
    method: 'POST',
    credentials: 'include',
    headers: pinHeader(pin),
    body: fd,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Request failed (${res.status})`);
  }
  return FinancePaidFixedCostSchema.parse((await res.json()) as unknown);
}

export function unmarkFixedCostPayment(
  fixedCostId: string,
  periodYear: number,
  periodMonth: number,
  pin: string,
): Promise<{ ok: true }> {
  return request(
    `/fixed-costs/${fixedCostId}/payment?year=${periodYear}&month=${periodMonth}`,
    { method: 'DELETE', headers: pinHeader(pin) },
    z.object({ ok: z.literal(true) }),
  );
}

export function fixedCostProofUrl(paymentId: string): string {
  return `/api/fixed-costs/payment/${paymentId}/proof`;
}
