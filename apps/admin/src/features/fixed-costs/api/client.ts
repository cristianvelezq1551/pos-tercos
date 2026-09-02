import {
  CreateFixedCostSchema,
  FinancePaidFixedCostSchema,
  FinancePendingFixedCostSchema,
  FixedCostSchema,
  UpdateFixedCostSchema,
  type CreateFixedCost,
  type FinancePaidFixedCost,
  type FinancePendingFixedCost,
  type FixedCost,
  type UpdateFixedCost,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';
import { prepararFoto } from '../../../lib/subir-archivo';
import { quitarComprobante, subirComprobantes } from '../../../lib/comprobantes';

const FixedCostListSchema = z.array(FixedCostSchema);
const FixedCostPendingListSchema = z.array(FinancePendingFixedCostSchema);

export function listFixedCosts(opts: { onlyActive?: boolean } = {}): Promise<FixedCost[]> {
  const qs = opts.onlyActive ? '?only_active=true' : '';
  return request(`/fixed-costs${qs}`, { method: 'GET' }, FixedCostListSchema);
}

/** Períodos pendientes por pagar (para el botón "Pagar" en la vista de costos). */
export function listPendingFixedCosts(): Promise<FinancePendingFixedCost[]> {
  return request('/fixed-costs/pending', { method: 'GET' }, FixedCostPendingListSchema);
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
// PAGO MENSUAL DEL COSTO FIJO (Dueño)
// ====================================================================

/** Marca pagado un costo fijo para (año, mes) con comprobante. */
export async function markFixedCostPaid(
  fixedCostId: string,
  proofs: File[],
  body: {
    periodYear: number;
    periodMonth: number;
    paidAt?: string;
    amount?: number;
    note?: string;
    cashAmount?: number;
    bankAmount?: number;
  },
): Promise<FinancePaidFixedCost> {
  const fd = new FormData();
  for (const f of proofs) fd.append('proof', await prepararFoto(f, 'fixed-cost-proof'));
  fd.append('periodYear', String(body.periodYear));
  fd.append('periodMonth', String(body.periodMonth));
  if (body.paidAt) fd.append('paidAt', body.paidAt);
  if (body.amount !== undefined) fd.append('amount', String(body.amount));
  if (body.note) fd.append('note', body.note);
  if (body.cashAmount !== undefined) fd.append('cashAmount', String(body.cashAmount));
  if (body.bankAmount !== undefined) fd.append('bankAmount', String(body.bankAmount));
  const res = await fetch(`/api/fixed-costs/${fixedCostId}/payment`, {
    method: 'POST',
    credentials: 'include',
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
): Promise<{ ok: true }> {
  return request(
    `/fixed-costs/${fixedCostId}/payment?year=${periodYear}&month=${periodMonth}`,
    { method: 'DELETE' },
    z.object({ ok: z.literal(true) }),
  );
}

export function fixedCostProofUrl(paymentId: string, index = 0): string {
  // El primero conserva la ruta de siempre (ver invoicePaymentProofUrl).
  return index === 0
    ? `/api/fixed-costs/payment/${paymentId}/proof`
    : `/api/fixed-costs/payment/${paymentId}/proof/${index}`;
}

const ProofsCountSchema = z.object({ proofsCount: z.number().int().nonnegative() });

/** Suma comprobantes a un pago de costo fijo ya registrado. */
export async function addFixedCostProofs(paymentId: string, files: File[]): Promise<number> {
  const r = await subirComprobantes(
    `/fixed-costs/payment/${paymentId}/proofs`,
    files,
    ProofsCountSchema,
  );
  return r.proofsCount;
}

export async function removeFixedCostProof(paymentId: string, index: number): Promise<number> {
  const r = await quitarComprobante(
    `/fixed-costs/payment/${paymentId}/proofs/${index}`,
    ProofsCountSchema,
  );
  return r.proofsCount;
}
