import { AnomaliesView } from '../../../../features/reports';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { CashierAnomalies } from '@pos-tercos/types';

async function loadAnomalies(): Promise<CashierAnomalies[] | { error: string }> {
  try {
    return await serverFetchJson<CashierAnomalies[]>('/reports/anomalies');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status} — solo el Dueño puede ver este reporte.` };
    }
    return { error: 'Network error' };
  }
}

export default async function AnomaliesPage() {
  const result = await loadAnomalies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Anomalías por cajero</h1>
        <p className="mt-1 text-sm text-gray-600">
          Por cajero, comparamos las métricas del último turno cerrado contra su histórico
          personal (≥5 turnos). Si una métrica supera <strong>media + 2σ</strong> se marca
          como anomalía. Útil para detectar comportamiento fraudulento individual sin
          regla absoluta.
        </p>
      </div>

      {Array.isArray(result) ? (
        <AnomaliesView data={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el reporte. {result.error}
        </p>
      )}
    </div>
  );
}
