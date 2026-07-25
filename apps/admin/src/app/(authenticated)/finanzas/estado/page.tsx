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
import { MonthCutoffCard, WebOrdersToggleCard, getBusinessConfigServer } from '../../../../features/business-config';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import { requireRole } from '../../../../lib/guards';
import {
  MonthlyFinancialStatementSchema,
  MonthlyTrendSchema,
  type MonthlyFinancialStatement,
  type MonthlyTrend,
} from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function FinancialStatementPage({ searchParams }: PageProps) {
  await requireRole(['DUENO']);
  const sp = await searchParams;
  // Hora local del server (TZ=America/Bogota en prod) — NO UTC: con getUTC* el
  // default saltaba al mes siguiente al final del mes después de las 19:00 Bogotá.
  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  let statement: MonthlyFinancialStatement;
  let trend: MonthlyTrend;
  try {
    [statement, trend] = await Promise.all([
      serverFetchJson<MonthlyFinancialStatement>(
        `/reports/financial/monthly?year=${year}&month=${month}`,
        undefined,
        MonthlyFinancialStatementSchema,
      ),
      serverFetchJson<MonthlyTrend>(
        `/reports/financial/trend?months=6&year=${year}&month=${month}`,
        undefined,
        MonthlyTrendSchema,
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
        description="Resultado real del mes: ingresos − COGS (FIFO) − costos fijos. Te dice si cubres todo y cuánto neto obtuviste. La nómina entra automática."
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
            <WebOrdersToggleCard enabled={businessConfig.webOrdersEnabled} />
            <BreakEvenCard s={statement} />
            <TrendCard trend={trend} />
          </div>
        </div>
      </Container>
    </>
  );
}
