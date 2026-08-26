import {
  ChecklistDaySchema,
  KitchenActivityDaySchema,
  KitchenProductionRunSchema,
  KitchenWasteEntrySchema,
  type ChecklistDay,
  type KitchenActivityDay,
  type KitchenProductionRun,
  type KitchenWasteEntry,
} from '@pos-tercos/types';
import { z } from 'zod';
import { serverFetchJson } from '../../lib/api-server';
import { friendlyApiError } from '../../lib/error-copy';

export interface KitchenQuery {
  from?: string;
  to?: string;
  userId?: string;
}

export type Loaded<T> = { data: T } | { error: string };

function qs(query: KitchenQuery): string {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.userId) params.set('user_id', query.userId);
  return params.toString() ? `?${params.toString()}` : '';
}

async function load<T>(path: string, schema: z.ZodType<T>): Promise<Loaded<T>> {
  try {
    return { data: await serverFetchJson(path, undefined, schema) };
  } catch (err) {
    // El fallo se MUESTRA: una tabla vacía por caída de red no puede leerse
    // igual que "ese día no se hizo nada" — que es justo lo que se viene a ver.
    return { error: friendlyApiError(err) };
  }
}

export function getKitchenActivity(query: KitchenQuery): Promise<Loaded<KitchenActivityDay[]>> {
  return load(`/kitchen/activity${qs(query)}`, z.array(KitchenActivityDaySchema));
}

export function getKitchenProductions(
  query: KitchenQuery,
): Promise<Loaded<KitchenProductionRun[]>> {
  return load(`/kitchen/productions${qs(query)}`, z.array(KitchenProductionRunSchema));
}

export function getKitchenWaste(query: KitchenQuery): Promise<Loaded<KitchenWasteEntry[]>> {
  return load(`/kitchen/waste${qs(query)}`, z.array(KitchenWasteEntrySchema));
}

export function getChecklistHistory(query: KitchenQuery): Promise<Loaded<ChecklistDay[]>> {
  return load(`/kitchen/checklist/history${qs(query)}`, z.array(ChecklistDaySchema));
}
