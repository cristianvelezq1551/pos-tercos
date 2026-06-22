import { Container, PageHeader } from '@pos-tercos/ui';
import { requireRole } from '../../../../lib/guards';
import { Activity } from 'lucide-react';
import { RangeFilter } from '../../../../features/reports-sales';
import {
  HourHeatmap,
  SuggestionsMetricsCard,
  WhatsAppMetricsCard,
} from '../../../../features/reports-operations';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
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
    return { error: friendlyApiError(err) };
  }
}

export default async function ReportsOperationsPage({ searchParams }: PageProps) {
  // Reportes financieros: solo el Dueño (defensa en profundidad — el endpoint ya es @OnlyDueno).
  await requireRole(['DUENO']);
  const sp = await searchParams;
  const result = await loadAll(sp.from, sp.to);

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Operación"
        description="Cobertura de WhatsApp por etapa, métricas de las sugerencias con IA y mapa de calor por día y hora."
        icon={<Activity className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-5">
          <RangeFilter />
          {'error' in result ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudo cargar el reporte. {result.error}
            </p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <WhatsAppMetricsCard metrics={result.whatsapp} />
                <SuggestionsMetricsCard metrics={result.suggestions} />
              </div>
              <HourHeatmap report={result.heatmap} />
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
