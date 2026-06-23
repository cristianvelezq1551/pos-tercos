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
import { request } from '../../../lib/api-client';

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
