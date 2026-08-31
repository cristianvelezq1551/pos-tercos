import { Container, PageHeader } from '@pos-tercos/ui';
import { TrendingUp } from 'lucide-react';
import { notFound } from 'next/navigation';
import {
  AiAnalysisCard,
  BreakEvenCard,
  DeliverySpendCard,
  PurchaseFreightCard,
  MonthPicker,
  PnlCard,
  TrendCard,
} from '../../../../features/financial';
import { MonthCutoffCard, WebOrdersToggleCard, getBusinessConfigServer } from '../../../../features/business-config';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import { requireRole } from '../../../../lib/guards';
import {
  businessWallClock,
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
  // El mes que se muestra por defecto lo decide la hora del LOCAL: esta
  // página se arma en el servidor (UTC), donde el 31 a las 8 pm ya es el
  // mes siguiente y el dueño abría un estado financiero vacío.
  const now = businessWallClock();
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
        {/* `min-w-0` en las dos columnas: un ítem de grid trae `min-width: auto`,
            así que su ancho mínimo es el de su contenido y NO se encoge. En
            celular eso estiraba la columna a 502 px dentro de 390 y los montos
            del estado financiero quedaban cortados por el borde derecho. */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 space-y-5 lg:col-span-2">
            <PnlCard s={statement} />
            <AiAnalysisCard year={year} month={month} />
          </div>
          <div className="min-w-0 space-y-5">
            <MonthCutoffCard
              monthStartDay={businessConfig.monthStartDay}
              periodStart={statement.periodStart}
              periodEnd={statement.periodEnd}
            />
            <WebOrdersToggleCard enabled={businessConfig.webOrdersEnabled} />
            <BreakEvenCard s={statement} />
            <PurchaseFreightCard s={statement} />
            <DeliverySpendCard s={statement} />
            <TrendCard trend={trend} />
          </div>
        </div>
      </Container>
    </>
  );
}
