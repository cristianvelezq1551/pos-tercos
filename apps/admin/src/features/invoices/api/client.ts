import {
  ConfirmInvoiceSchema,
  CreateFromPhotoSchema,
  ExtractInvoiceResponseSchema,
  InvoiceDraftResponseSchema,
  InvoiceSchema,
  TreasuryAnchorDateSchema,
  UploadPaymentProofResponseSchema,
  type ConfirmInvoice,
  type ExtractInvoiceResponse,
  type Invoice,
  type InvoiceDraftResponse,
  type UploadPaymentProofResponse,
} from '@pos-tercos/types';
import { z } from 'zod';

const InvoiceListSchema = z.array(InvoiceSchema);

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; cause?: string };
    const detail = body.cause ? ` — ${body.cause}` : '';
    throw new Error(`${body.message ?? `Request failed (${res.status})`}${detail}`);
  }
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

/**
 * Sube foto a IA. NO crea borrador — solo devuelve la extracción + photoStorageKey.
 * El cliente debe llamar `confirmFromPhoto` al confirmar (o `discardPhoto` si abandona).
 */
export function uploadInvoicePhoto(file: File): Promise<ExtractInvoiceResponse> {
  const fd = new FormData();
  fd.append('photo', file);
  return request('/invoices/upload-photo', { method: 'POST', body: fd }, ExtractInvoiceResponseSchema);
}

/** Crear+confirmar factura desde foto (IA) en un solo paso. */
export function confirmFromPhoto(
  payload: ConfirmInvoice,
  photoStorageKey: string,
  aiModelUsed: string,
): Promise<Invoice> {
  const body = { ...payload, photoStorageKey, aiModelUsed };
  CreateFromPhotoSchema.parse(body);
  return request(
    '/invoices/from-photo',
    { method: 'POST', body: JSON.stringify(body) },
    InvoiceSchema,
  );
}

/** Limpia la foto subida cuando el usuario cierra el modal sin confirmar. */
export async function discardPhoto(photoStorageKey: string): Promise<void> {
  const res = await fetch('/api/invoices/discard-photo', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoStorageKey }),
  });
  if (!res.ok && res.status !== 204) {
    // No throw: la limpieza es best-effort; el cron sweep eventualmente la elimina.
  }
}

/**
 * Pre-sube el comprobante de pago para "nace pagada" (carga manual). El
 * confirm asocia la key devuelta; si el usuario abandona, `discardPaymentProof`.
 */
export function uploadPaymentProof(file: File): Promise<UploadPaymentProofResponse> {
  const fd = new FormData();
  fd.append('proof', file);
  return request(
    '/invoices/upload-payment-proof',
    { method: 'POST', body: fd },
    UploadPaymentProofResponseSchema,
  );
}

/** Limpia un comprobante pre-subido que no llegó a confirmarse (best-effort). */
export async function discardPaymentProof(proofStorageKey: string): Promise<void> {
  await fetch('/api/invoices/discard-payment-proof', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proofStorageKey }),
  }).catch(() => {
    // Best-effort: el sweep semanal de huérfanos lo limpia igual.
  });
}

/**
 * Fecha de corte de Tesorería (sin saldos) — para avisar cuando la fecha del
 * pago es anterior al corte. Null si falla (el aviso simplemente no aparece).
 */
export async function getTreasuryAnchorDate(): Promise<string | null> {
  try {
    const { anchorDate } = await request(
      '/treasury/anchor-date',
      { method: 'GET' },
      TreasuryAnchorDateSchema,
    );
    return anchorDate;
  } catch {
    return null;
  }
}

/** Carga manual: crea Y confirma la factura en un solo paso. No deja borrador. */
export function confirmManualInvoice(payload: ConfirmInvoice): Promise<Invoice> {
  ConfirmInvoiceSchema.parse(payload);
  return request(
    '/invoices/manual',
    { method: 'POST', body: JSON.stringify(payload) },
    InvoiceSchema,
  );
}

export function listInvoices(filter: { status?: string; limit?: number } = {}): Promise<Invoice[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request(`/invoices${qs}`, { method: 'GET' }, InvoiceListSchema);
}

export function getInvoice(id: string): Promise<Invoice> {
  return request(`/invoices/${id}`, { method: 'GET' }, InvoiceSchema);
}

export function confirmInvoice(id: string, payload: ConfirmInvoice): Promise<Invoice> {
  ConfirmInvoiceSchema.parse(payload);
  return request(
    `/invoices/${id}/confirm`,
    { method: 'POST', body: JSON.stringify(payload) },
    InvoiceSchema,
  );
}

export function rejectInvoice(id: string, reason?: string): Promise<Invoice> {
  return request(
    `/invoices/${id}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    InvoiceSchema,
  );
}

export function cloneInvoice(sourceInvoiceId: string): Promise<InvoiceDraftResponse> {
  return request(
    '/invoices/from-clone',
    { method: 'POST', body: JSON.stringify({ sourceInvoiceId }) },
    InvoiceDraftResponseSchema,
  );
}

/** FASE 4 ajustes 2.10: borra borrador PENDING_REVIEW. */
export async function deleteInvoiceDraft(id: string): Promise<void> {
  const res = await fetch(`/api/invoices/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
}

// ====================================================================
// PAGO AL PROVEEDOR (Dueño + PIN)
// ====================================================================

function pinHeader(pin: string): Record<string, string> {
  return { 'X-Approval-Pin': pin };
}

/** Marca pagada con comprobante (multipart). */
export async function markInvoicePaid(
  invoiceId: string,
  proof: File,
  pin: string,
  opts: { paidAt?: string; note?: string; cashAmount?: number; bankAmount?: number },
): Promise<Invoice> {
  const fd = new FormData();
  fd.append('proof', proof);
  if (opts.paidAt) fd.append('paidAt', opts.paidAt);
  if (opts.note) fd.append('note', opts.note);
  if (opts.cashAmount !== undefined) fd.append('cashAmount', String(opts.cashAmount));
  if (opts.bankAmount !== undefined) fd.append('bankAmount', String(opts.bankAmount));
  const res = await fetch(`/api/invoices/${invoiceId}/payment/paid`, {
    method: 'POST',
    credentials: 'include',
    headers: pinHeader(pin),
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return InvoiceSchema.parse((await res.json()) as unknown);
}

export function unmarkInvoicePayment(invoiceId: string, pin: string): Promise<Invoice> {
  return request(
    `/invoices/${invoiceId}/payment`,
    { method: 'DELETE', headers: pinHeader(pin) },
    InvoiceSchema,
  );
}

/** URL del comprobante para mostrar en <img src=...>. */
export function invoicePaymentProofUrl(invoiceId: string): string {
  return `/api/invoices/${invoiceId}/payment-proof`;
}
