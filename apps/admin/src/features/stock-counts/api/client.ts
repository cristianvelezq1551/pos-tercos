import {
  CountTaskSchema,
  StockCountSchema,
  type CountTask,
  type CreateStockCount,
  type StockCount,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const TasksSchema = z.array(CountTaskSchema);
const CountsSchema = z.array(StockCountSchema);

export function fetchCountTasks(limit = 5): Promise<CountTask[]> {
  return request(`/inventory/count-tasks?limit=${limit}`, { method: 'GET' }, TasksSchema);
}

export function registerCount(input: CreateStockCount): Promise<StockCount> {
  return request('/inventory/counts', { method: 'POST', body: JSON.stringify(input) }, StockCountSchema);
}

export function fetchRecentCounts(limit = 30): Promise<StockCount[]> {
  return request(`/inventory/counts?limit=${limit}`, { method: 'GET' }, CountsSchema);
}
