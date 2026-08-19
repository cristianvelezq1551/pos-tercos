import { ShiftSchema, type CloseShift, type Shift } from '@pos-tercos/types';

export async function closeShift(shiftId: string, input: CloseShift): Promise<Shift> {
  const res = await fetch(`/api/shifts/${shiftId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ShiftSchema.parse(json);
}
