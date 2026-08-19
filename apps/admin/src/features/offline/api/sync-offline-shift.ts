import {
  SyncOfflineShiftOpenResponseSchema,
  type SyncOfflineShiftOpenResponse,
} from '@pos-tercos/types';
import type { OfflineShiftOpen } from '../lib/types';

/**
 * Sincroniza la apertura de caja hecha OFFLINE (B.4b). Idempotente por
 * `localId` — reintentar es seguro. Si mientras tanto alguien abrió la caja
 * online, el backend la adopta (`adopted: true`) en vez de crear otra.
 */
export async function syncOfflineShiftOpen(
  open: OfflineShiftOpen,
): Promise<SyncOfflineShiftOpenResponse> {
  const res = await fetch('/api/shifts/sync-offline-open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      localId: open.localId,
      openingCash: open.openingCash,
      notes: open.notes ?? undefined,
      openedOfflineAt: open.openedOfflineAt,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return SyncOfflineShiftOpenResponseSchema.parse(await res.json());
}
