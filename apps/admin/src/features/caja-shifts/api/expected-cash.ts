import { ExpectedCashSchema, type ExpectedCash } from '@pos-tercos/types';

/** Efectivo esperado AUTORITATIVO de la caja (mismo cálculo que el cierre). */
export async function getExpectedCash(shiftId: string): Promise<ExpectedCash> {
  const res = await fetch(`/api/shifts/${shiftId}/expected-cash`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`getExpectedCash failed: ${res.status}`);
  return ExpectedCashSchema.parse(await res.json());
}
