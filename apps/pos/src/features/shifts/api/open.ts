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
    // La apertura de caja offline está diferida a propósito (B.4b): el
    // mensaje debe decir QUÉ pasa, no "Error desconocido".
    throw new Error(
      'Sin conexión con el servidor. La caja se abre con internet — reconectá e intentá de nuevo.',
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return ShiftSchema.parse(json);
}
