import {
  CreatePromotionSchema,
  PromotionSchema,
  UpdatePromotionSchema,
  type CreatePromotion,
  type Promotion,
  type UpdatePromotion,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const PromotionListSchema = z.array(PromotionSchema);

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
