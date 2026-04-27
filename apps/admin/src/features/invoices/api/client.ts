import {
  ConfirmInvoiceSchema,
  InvoiceDraftResponseSchema,
  InvoiceSchema,
  type ConfirmInvoice,
  type Invoice,
  type InvoiceDraftResponse,
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

export function uploadInvoicePhoto(file: File): Promise<InvoiceDraftResponse> {
  const fd = new FormData();
  fd.append('photo', file);
  return request('/invoices/upload-photo', { method: 'POST', body: fd }, InvoiceDraftResponseSchema);
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
