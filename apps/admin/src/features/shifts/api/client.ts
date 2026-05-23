import { ShiftSchema, type Shift } from '@pos-tercos/types';

/** Reabre una caja cerrada por error (admin/dueño). Conserva la sesión del día. */
export async function reopenShift(id: string): Promise<Shift> {
  const res = await fetch(`/api/shifts/${id}/reopen`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `No se pudo reabrir la caja (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return ShiftSchema.parse(json);
}
