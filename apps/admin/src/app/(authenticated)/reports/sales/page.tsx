import { Container, PageHeader } from '@pos-tercos/ui';
import { LineChart } from 'lucide-react';
import {
  RangeFilter,
  SalesSummaryView,
} from '../../../../features/reports-sales';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { SalesSummary } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    granularity?: string;
  }>;
}

async function loadSummary(
  from: string | undefined,
  to: string | undefined,
  granularity: string | undefined,
): Promise<SalesSummary | { error: string }> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (granularity) qs.set('granularity', granularity);
  const path = `/reports/sales-summary${qs.toString() ? `?${qs.toString()}` : ''}`;
  try {
    return await serverFetchJson<SalesSummary>(path);
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function ReportsSalesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadSummary(sp.from, sp.to, sp.granularity);

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Ventas y métodos de pago"
        description="Serie temporal y desglose por tipo de pedido y método de pago. Solo cuenta ventas pagadas."
        icon={<LineChart className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-5">
          <RangeFilter showGranularity />
          {'error' in result ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudo cargar el reporte. {result.error}
            </p>
          ) : (
            <SalesSummaryView summary={result} />
          )}
        </div>
      </Container>
    </>
  );
}
