import {
  FinanceSummarySchema,
  FinancialAnalysisSchema,
  MonthlyFinancialStatementSchema,
  MonthlyTrendSchema,
  type FinanceSummary,
  type FinancialAnalysis,
  type MonthlyFinancialStatement,
  type MonthlyTrend,
} from '@pos-tercos/types';
import { z } from 'zod';

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return schema.parse((await res.json()) as unknown);
}

export function getMonthlyStatement(year: number, month: number): Promise<MonthlyFinancialStatement> {
  return request(
    `/reports/financial/monthly?year=${year}&month=${month}`,
    { method: 'GET' },
    MonthlyFinancialStatementSchema,
  );
}

export function getMonthlyTrend(
  months: number,
  year?: number,
  month?: number,
): Promise<MonthlyTrend> {
  const qs = new URLSearchParams({ months: String(months) });
  if (year !== undefined) qs.set('year', String(year));
  if (month !== undefined) qs.set('month', String(month));
  return request(`/reports/financial/trend?${qs.toString()}`, { method: 'GET' }, MonthlyTrendSchema);
}

export function analyzeFinancial(year: number, month: number): Promise<FinancialAnalysis> {
  return request(
    `/reports/financial/analyze?year=${year}&month=${month}`,
    { method: 'POST' },
    FinancialAnalysisSchema,
  );
}

/** Cockpit cash-based: ingresos / pagado / pendiente / neto + detalle. */
export function getFinanceSummary(year: number, month: number): Promise<FinanceSummary> {
  return request(
    `/reports/finance-summary?year=${year}&month=${month}`,
    { method: 'GET' },
    FinanceSummarySchema,
  );
}
