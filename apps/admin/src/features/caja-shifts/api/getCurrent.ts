import { ShiftSchema, type Shift } from '@pos-tercos/types';

export async function getCurrentShift(): Promise<Shift | null> {
  const res = await fetch('/api/shifts/current', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`getCurrentShift failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  if (json === null) return null;
  return ShiftSchema.parse(json);
}
