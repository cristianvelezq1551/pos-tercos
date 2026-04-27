import { SupplierSchema, type Supplier } from '@pos-tercos/types';
import { z } from 'zod';

const SupplierListSchema = z.array(SupplierSchema);

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

export function listSuppliers(): Promise<Supplier[]> {
  return request('/suppliers', { method: 'GET' }, SupplierListSchema);
}
