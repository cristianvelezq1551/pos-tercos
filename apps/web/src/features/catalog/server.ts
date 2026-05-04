import {
  PublicMenuResponseSchema,
  type PublicMenuResponse,
} from '@pos-tercos/types';
import { publicFetch } from '../../lib/api-server';

const EMPTY: PublicMenuResponse = {
  products: [],
  categories: [],
  asOf: new Date(0).toISOString(),
};

export async function getMenuServer(): Promise<PublicMenuResponse> {
  const json = await publicFetch<unknown>('/web/menu');
  if (json === null) return EMPTY;
  const parsed = PublicMenuResponseSchema.safeParse(json);
  return parsed.success ? parsed.data : EMPTY;
}
