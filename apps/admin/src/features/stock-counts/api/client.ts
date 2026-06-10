import {
  CountTaskSchema,
  StockCountSchema,
  type CountTask,
  type CreateStockCount,
  type StockCount,
} from '@pos-tercos/types';
import { z } from 'zod';

const TasksSchema = z.array(CountTaskSchema);
const CountsSchema = z.array(StockCountSchema);

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return schema.parse((await res.json()) as unknown);
}

export function fetchCountTasks(limit = 5): Promise<CountTask[]> {
  return request(`/inventory/count-tasks?limit=${limit}`, { method: 'GET' }, TasksSchema);
}

export function registerCount(input: CreateStockCount): Promise<StockCount> {
  return request('/inventory/counts', { method: 'POST', body: JSON.stringify(input) }, StockCountSchema);
}

export function fetchRecentCounts(limit = 30): Promise<StockCount[]> {
  return request(`/inventory/counts?limit=${limit}`, { method: 'GET' }, CountsSchema);
}
