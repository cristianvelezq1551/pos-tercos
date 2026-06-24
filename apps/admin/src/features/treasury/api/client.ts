import {
  CreateAdjustmentSchema,
  CreateTransferSchema,
  TreasuryConfigSchema,
  TreasuryMovementSchema,
  TreasurySummarySchema,
  UpdateTreasuryConfigSchema,
  type CreateAdjustment,
  type CreateTransfer,
  type TreasuryConfig,
  type TreasuryMovement,
  type TreasurySummary,
  type UpdateTreasuryConfig,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request, validateInput } from '../../../lib/api-client';

const MovementListSchema = z.array(TreasuryMovementSchema);

export function getTreasurySummary(): Promise<TreasurySummary> {
  return request('/treasury/summary', { method: 'GET' }, TreasurySummarySchema);
}

export function getTreasuryConfig(): Promise<TreasuryConfig> {
  return request('/treasury/config', { method: 'GET' }, TreasuryConfigSchema);
}

export function updateTreasuryConfig(input: UpdateTreasuryConfig): Promise<TreasuryConfig> {
  validateInput(UpdateTreasuryConfigSchema, input);
  return request('/treasury/config', { method: 'PATCH', body: JSON.stringify(input) }, TreasuryConfigSchema);
}

export function listTreasuryMovements(): Promise<TreasuryMovement[]> {
  return request('/treasury/movements', { method: 'GET' }, MovementListSchema);
}

export function createTransfer(input: CreateTransfer): Promise<TreasuryMovement> {
  validateInput(CreateTransferSchema, input);
  return request('/treasury/transfer', { method: 'POST', body: JSON.stringify(input) }, TreasuryMovementSchema);
}

export function createAdjustment(input: CreateAdjustment): Promise<TreasuryMovement> {
  validateInput(CreateAdjustmentSchema, input);
  return request('/treasury/adjustment', { method: 'POST', body: JSON.stringify(input) }, TreasuryMovementSchema);
}

export async function voidTreasuryMovement(id: string): Promise<void> {
  const res = await fetch(`/api/treasury/movements/${id}/void`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
}
