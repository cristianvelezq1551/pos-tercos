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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ventas y métodos de pago</h1>
        <p className="mt-1 text-sm text-gray-600">
          Serie temporal + breakdown por tipo de pedido y método de pago. Solo
          se cuentan ventas pagadas (excluye PENDIENTE_PAGO, CANCELADO_NO_PAGO, VOID).
        </p>
      </div>

      <RangeFilter showGranularity />

      {'error' in result ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el reporte. {result.error}
        </p>
      ) : (
        <SalesSummaryView summary={result} />
      )}
    </div>
  );
}
