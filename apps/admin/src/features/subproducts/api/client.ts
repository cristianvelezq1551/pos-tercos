import {
  CreateSubproductSchema,
  SubproductSchema,
  UpdateSubproductSchema,
  type CreateSubproduct,
  type Subproduct,
  type UpdateSubproduct,
} from '@pos-tercos/types';
import { z } from 'zod';

const SubproductListSchema = z.array(SubproductSchema);

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

export function listSubproducts(): Promise<Subproduct[]> {
  return request('/subproducts', { method: 'GET' }, SubproductListSchema);
}

export function getSubproduct(id: string): Promise<Subproduct> {
  return request(`/subproducts/${id}`, { method: 'GET' }, SubproductSchema);
}

export function createSubproduct(input: CreateSubproduct): Promise<Subproduct> {
  CreateSubproductSchema.parse(input);
  return request(
    '/subproducts',
    { method: 'POST', body: JSON.stringify(input) },
    SubproductSchema,
  );
}

export function updateSubproduct(id: string, input: UpdateSubproduct): Promise<Subproduct> {
  UpdateSubproductSchema.parse(input);
  return request(
    `/subproducts/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    SubproductSchema,
  );
}

export function deactivateSubproduct(id: string): Promise<Subproduct> {
  return request(`/subproducts/${id}`, { method: 'DELETE' }, SubproductSchema);
}
