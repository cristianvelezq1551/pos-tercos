import { DashboardSummarySchema, type DashboardSummary } from '@pos-tercos/types';
import { request } from '../../../lib/api-client';

/** Snapshot del dashboard (revenue del día + cocina en vivo). Valida con Zod. */
export function getDashboardSummary(): Promise<DashboardSummary> {
  return request('/reports/dashboard', { method: 'GET', cache: 'no-store' }, DashboardSummarySchema);
}
