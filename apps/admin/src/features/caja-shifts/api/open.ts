import { ShiftSchema, type OpenShift, type Shift } from '@pos-tercos/types';

export async function openShift(input: OpenShift): Promise<Shift> {
  let res: Response;
  try {
    res = await fetch('/api/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
  } catch {
    // B.4b: el form detecta este nombre y cae a la apertura OFFLINE local.
    const err = new Error('Sin conexión con el servidor.');
    err.name = 'NetworkError';
    throw err;
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ShiftSchema.parse(json);
}
