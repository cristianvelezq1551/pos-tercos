import {
  CreateSubproductSchema,
  ProductionRunSchema,
  RecordProductionSchema,
  SubproductSchema,
  UpdateSubproductSchema,
  type CreateSubproduct,
  type ProductionRun,
  type RecordProduction,
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
  return request(`/subproducts/${id}/deactivate`, { method: 'POST' }, SubproductSchema);
}

/** Elimina DEFINITIVAMENTE (solo si no está en uso en otra receta). 409 si sí. */
export async function deleteSubproduct(id: string): Promise<void> {
  const res = await fetch(`/api/subproducts/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
}

/**
 * Registra una tanda de producción: +N al stock del subproducto y consume
 * insumos (y sub-subproductos) según receta. El backend valida stock y
 * devuelve 409 con detalle si falta algo.
 */
export function produceSubproduct(
  id: string,
  input: RecordProduction,
): Promise<ProductionRun> {
  RecordProductionSchema.parse(input);
  return request(
    `/subproducts/${id}/produce`,
    { method: 'POST', body: JSON.stringify(input) },
    ProductionRunSchema,
  );
}
