import {
  CreatePromotionSchema,
  PromotionSchema,
  UpdatePromotionSchema,
  type CreatePromotion,
  type Promotion,
  type UpdatePromotion,
} from '@pos-tercos/types';
import { z } from 'zod';

const PromotionListSchema = z.array(PromotionSchema);

async function request<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodSchema<T>,
): Promise<T> {
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

export function listPromotions(opts: { onlyActive?: boolean } = {}): Promise<Promotion[]> {
  const qs = opts.onlyActive ? '?only_active=true' : '';
  return request(`/promotions${qs}`, { method: 'GET' }, PromotionListSchema);
}

export function getPromotion(id: string): Promise<Promotion> {
  return request(`/promotions/${id}`, { method: 'GET' }, PromotionSchema);
}

export function createPromotion(input: CreatePromotion): Promise<Promotion> {
  CreatePromotionSchema.parse(input);
  return request(
    '/promotions',
    { method: 'POST', body: JSON.stringify(input) },
    PromotionSchema,
  );
}

export function updatePromotion(
  id: string,
  input: UpdatePromotion,
): Promise<Promotion> {
  UpdatePromotionSchema.parse(input);
  return request(
    `/promotions/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    PromotionSchema,
  );
}

export function deactivatePromotion(id: string): Promise<Promotion> {
  return request(`/promotions/${id}`, { method: 'DELETE' }, PromotionSchema);
}
