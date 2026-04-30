import { ShiftSchema, type Shift } from '@pos-tercos/types';
import { serverFetch } from '../../lib/api-server';

export async function getCurrentShiftServer(): Promise<Shift | null> {
  const res = await serverFetch('/shifts/current');
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as unknown;
  if (json === null) return null;
  const parsed = ShiftSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
