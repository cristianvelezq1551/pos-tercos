import { PromotionSchema, type Promotion } from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(PromotionSchema);

export async function fetchActivePromotions(): Promise<Promotion[]> {
  // channel=POS: las promos solo-web no aplican en caja (ni tachados ni cobro).
  const res = await fetch('/api/promotions?only_active=true&channel=POS', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`fetchActivePromotions failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ListSchema.parse(json);
}
