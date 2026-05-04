import { RangeFilter } from '../../../../features/reports-sales';
import {
  HourHeatmap,
  SuggestionsMetricsCard,
  WhatsAppMetricsCard,
} from '../../../../features/reports-operations';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type {
  HourHeatmapReport,
  SuggestionsMetrics,
  WhatsAppMetrics,
} from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

async function loadAll(
  from: string | undefined,
  to: string | undefined,
): Promise<
  | {
      whatsapp: WhatsAppMetrics;
      suggestions: SuggestionsMetrics;
      heatmap: HourHeatmapReport;
    }
  | { error: string }
> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  try {
    const [whatsapp, suggestions, heatmap] = await Promise.all([
      serverFetchJson<WhatsAppMetrics>(`/reports/whatsapp-metrics${suffix}`),
      serverFetchJson<SuggestionsMetrics>(`/reports/suggestions-metrics${suffix}`),
      serverFetchJson<HourHeatmapReport>(`/reports/hour-heatmap${suffix}`),
    ]);
    return { whatsapp, suggestions, heatmap };
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function ReportsOperationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadAll(sp.from, sp.to);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operación</h1>
        <p className="mt-1 text-sm text-gray-600">
          Cobertura WhatsApp por stage, métricas de sugerencias IA y heatmap
          día × hora del demand.
        </p>
      </div>

      <RangeFilter />

      {'error' in result ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el reporte. {result.error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <WhatsAppMetricsCard metrics={result.whatsapp} />
            <SuggestionsMetricsCard metrics={result.suggestions} />
          </div>
          <HourHeatmap report={result.heatmap} />
        </>
      )}
    </div>
  );
}
