import {
  CashMovementSchema,
  CreateCashMovementSchema,
  type CashMovement,
  type CreateCashMovement,
} from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(CashMovementSchema);

export async function listCashMovements(shiftId: string): Promise<CashMovement[]> {
  const res = await fetch(`/api/shifts/${shiftId}/cash-movements`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`listCashMovements failed: ${res.status}`);
  return ListSchema.parse(await res.json());
}

export async function addCashMovement(
  shiftId: string,
  input: CreateCashMovement,
): Promise<CashMovement> {
  const body = CreateCashMovementSchema.parse(input);
  const res = await fetch(`/api/shifts/${shiftId}/cash-movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `addCashMovement failed: ${res.status}`);
  }
  return CashMovementSchema.parse(await res.json());
}

export async function updateCashMovement(
  shiftId: string,
  movementId: string,
  input: CreateCashMovement,
): Promise<CashMovement> {
  const body = CreateCashMovementSchema.parse(input);
  const res = await fetch(`/api/shifts/${shiftId}/cash-movements/${movementId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `updateCashMovement failed: ${res.status}`);
  }
  return CashMovementSchema.parse(await res.json());
}

export async function deleteCashMovement(shiftId: string, movementId: string): Promise<void> {
  const res = await fetch(`/api/shifts/${shiftId}/cash-movements/${movementId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `deleteCashMovement failed: ${res.status}`);
  }
}
