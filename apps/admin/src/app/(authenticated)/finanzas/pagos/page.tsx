import { Container, PageHeader } from '@pos-tercos/ui';
import { Receipt } from 'lucide-react';
import { notFound } from 'next/navigation';
import {
  FinanceCockpit,
  MonthPicker,
} from '../../../../features/financial';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import { requireRole } from '../../../../lib/guards';
import { FinanceSummarySchema, businessWallClock, type FinanceSummary } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

/**
 * Cockpit cash-based: qué entró, qué pagué, qué debo.
 *
 * Hermano de /finanzas/estado (que muestra P&G accrual con COGS FIFO).
 * Esta vista responde la pregunta operativa "¿estoy al día con la gente
 * y los proveedores?", no la pregunta contable "¿gané plata este mes?".
 */
export default async function FinancePagosPage({ searchParams }: PageProps) {
  await requireRole(['DUENO']);
  const sp = await searchParams;
  // Hora local del server (TZ=America/Bogota en prod) — NO UTC (ver /finanzas/estado).
  // El mes que se muestra por defecto lo decide la hora del LOCAL: esta
  // página se arma en el servidor (UTC), donde el 31 a las 8 pm ya es el
  // mes siguiente y el dueño abría un estado financiero vacío.
  const now = businessWallClock();
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  let summary: FinanceSummary;
  try {
    summary = await serverFetchJson<FinanceSummary>(
      `/reports/finance-summary?year=${year}&month=${month}`,
      undefined,
      FinanceSummarySchema,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        eyebrow="Finanzas"
        title="Pagos y cobros"
        description="Lo que entró, lo que pagaste y lo que todavía debes. Los pendientes incluyen meses anteriores no pagados; lo pagado y los ingresos son del mes seleccionado."
        icon={<Receipt className="h-6 w-6" strokeWidth={1.75} />}
        actions={<MonthPicker year={year} month={month} />}
      />
      <Container size="7xl" padY="md">
        <FinanceCockpit summary={summary} />
      </Container>
    </>
  );
}
