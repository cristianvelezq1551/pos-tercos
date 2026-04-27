import { AuditTable } from '../../../features/audit';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { AuditLogEntry } from '@pos-tercos/types';

async function loadAudit(): Promise<AuditLogEntry[] | { error: string; status?: number }> {
  try {
    return await serverFetchJson<AuditLogEntry[]>('/audit?limit=200');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.status === 403 ? 'Solo el Dueño puede ver el log de auditoría.' : `API ${err.status}`, status: err.status };
    }
    return { error: 'Network error' };
  }
}

export default async function AuditPage() {
  const result = await loadAudit();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoría</h1>
        <p className="mt-1 text-sm text-gray-600">
          Histórico inmutable de acciones sensibles: logins, cambios de catálogo, movimientos de
          inventario, anulaciones, descuentos, aperturas de cajón, ajustes manuales.
        </p>
      </div>

      {Array.isArray(result) ? (
        <AuditTable rows={result} />
      ) : (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            result.status === 403
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {result.error}
        </p>
      )}
    </div>
  );
}
