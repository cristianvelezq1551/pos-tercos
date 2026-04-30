import { PromotionSchema, type Promotion } from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(PromotionSchema);

export async function fetchActivePromotions(): Promise<Promotion[]> {
  const res = await fetch('/api/promotions?only_active=true', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`fetchActivePromotions failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ListSchema.parse(json);
}
