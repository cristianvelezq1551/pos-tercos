import {
  CashMovementSchema,
  CreateDeliveryPayoutSchema,
  type CashMovement,
  type CreateDeliveryPayout,
} from '@pos-tercos/types';
import { z } from 'zod';

const ParSchema = z.array(CashMovementSchema);

/**
 * Registra un domicilio que el cliente pagó por transferencia y el cajero pagó
 * en efectivo del cajón. Devuelve las DOS patas del movimiento (§7.v71).
 */
export async function addDeliveryPayout(
  shiftId: string,
  input: CreateDeliveryPayout,
): Promise<CashMovement[]> {
  const body = CreateDeliveryPayoutSchema.parse(input);
  const res = await fetch(`/api/shifts/${shiftId}/delivery-payout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `addDeliveryPayout failed: ${res.status}`);
  }
  return ParSchema.parse(await res.json());
}

/** Lo deshace entero: las dos patas y su traspaso de tesorería. */
export async function deleteDeliveryPayout(shiftId: string, pairId: string): Promise<void> {
  const res = await fetch(`/api/shifts/${shiftId}/delivery-payout/${pairId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `deleteDeliveryPayout failed: ${res.status}`);
  }
}
