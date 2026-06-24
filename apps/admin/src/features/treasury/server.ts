import {
  TreasuryConfigSchema,
  TreasuryMovementSchema,
  TreasurySummarySchema,
  type TreasuryConfig,
  type TreasuryMovement,
  type TreasurySummary,
} from '@pos-tercos/types';
import { z } from 'zod';
import { serverFetchJson } from '../../lib/api-server';

export function getTreasurySummaryServer(): Promise<TreasurySummary> {
  return serverFetchJson<TreasurySummary>('/treasury/summary', undefined, TreasurySummarySchema);
}

export function getTreasuryConfigServer(): Promise<TreasuryConfig> {
  return serverFetchJson<TreasuryConfig>('/treasury/config', undefined, TreasuryConfigSchema);
}

export function getTreasuryMovementsServer(): Promise<TreasuryMovement[]> {
  return serverFetchJson<TreasuryMovement[]>(
    '/treasury/movements',
    undefined,
    z.array(TreasuryMovementSchema),
  );
}
