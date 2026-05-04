import { ShiftsTable } from '../../../features/shifts';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Shift } from '@pos-tercos/types';

async function loadShifts(): Promise<Shift[] | { error: string }> {
  try {
    return await serverFetchJson<Shift[]>('/shifts?limit=100');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function ShiftsPage() {
  const result = await loadShifts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Turnos de caja</h1>
        <p className="mt-1 text-sm text-gray-600">
          Histórico de aperturas y cierres. La diferencia &gt;= $5.000 dispara alerta de
          anomalía en audit log.
        </p>
      </div>

      {Array.isArray(result) ? (
        <ShiftsTable shifts={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los turnos. {result.error}
        </p>
      )}
    </div>
  );
}
