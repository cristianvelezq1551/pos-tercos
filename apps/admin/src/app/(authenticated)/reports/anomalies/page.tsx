import { Container, PageHeader } from '@pos-tercos/ui';
import { AlertTriangle } from 'lucide-react';
import { AnomaliesView } from '../../../../features/reports';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { CashierAnomalies } from '@pos-tercos/types';

async function loadAnomalies(): Promise<CashierAnomalies[] | { error: string }> {
  try {
    return await serverFetchJson<CashierAnomalies[]>('/reports/anomalies');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status} — solo el dueño puede ver este reporte.` };
    }
    return { error: 'Network error' };
  }
}

export default async function AnomaliesPage() {
  const result = await loadAnomalies();

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Anomalías por cajero"
        description="Comparamos las métricas del último turno cerrado contra el histórico personal del cajero (mínimo 5 turnos). Si una métrica supera media + 2σ, se marca como anomalía."
        icon={<AlertTriangle className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <AnomaliesView data={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudo cargar el reporte. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
