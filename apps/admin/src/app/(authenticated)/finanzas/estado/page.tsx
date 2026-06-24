import { Container, PageHeader } from '@pos-tercos/ui';
import { TrendingUp } from 'lucide-react';
import { notFound } from 'next/navigation';
import {
  AiAnalysisCard,
  BreakEvenCard,
  MonthPicker,
  PnlCard,
  TrendCard,
} from '../../../../features/financial';
import { MonthCutoffCard, getBusinessConfigServer } from '../../../../features/business-config';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import { requireRole } from '../../../../lib/guards';
import type { MonthlyFinancialStatement, MonthlyTrend } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function FinancialStatementPage({ searchParams }: PageProps) {
  await requireRole(['DUENO']);
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getUTCFullYear();
  const month = sp.month ? Number(sp.month) : now.getUTCMonth() + 1;

  let statement: MonthlyFinancialStatement;
  let trend: MonthlyTrend;
  try {
    [statement, trend] = await Promise.all([
      serverFetchJson<MonthlyFinancialStatement>(
        `/reports/financial/monthly?year=${year}&month=${month}`,
      ),
      serverFetchJson<MonthlyTrend>(
        `/reports/financial/trend?months=6&year=${year}&month=${month}`,
      ),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const businessConfig = await getBusinessConfigServer();

  return (
    <>
      <PageHeader
        eyebrow="Finanzas"
        title="Estado financiero"
        description="Resultado real del mes: ingresos − COGS (FIFO) − costos fijos. Te dice si cubrís todo y cuánto neto sacaste. La nómina entra automática."
        icon={<TrendingUp className="h-6 w-6" strokeWidth={1.75} />}
        actions={<MonthPicker year={year} month={month} />}
      />
      <Container size="7xl" padY="md">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <PnlCard s={statement} />
            <AiAnalysisCard year={year} month={month} />
          </div>
          <div className="space-y-5">
            <MonthCutoffCard
              monthStartDay={businessConfig.monthStartDay}
              periodStart={statement.periodStart}
              periodEnd={statement.periodEnd}
            />
            <BreakEvenCard s={statement} />
            <TrendCard trend={trend} />
          </div>
        </div>
      </Container>
    </>
  );
}
