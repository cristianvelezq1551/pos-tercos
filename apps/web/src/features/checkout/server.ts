import {
  PublicWebOrderSchema,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { publicFetch } from '../../lib/api-server';

export async function getWebOrderServer(
  saleId: string,
  token: string,
): Promise<PublicWebOrder | null> {
  const json = await publicFetch<unknown>(
    `/web/orders/${saleId}?token=${encodeURIComponent(token)}`,
  );
  if (json === null) return null;
  const parsed = PublicWebOrderSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
