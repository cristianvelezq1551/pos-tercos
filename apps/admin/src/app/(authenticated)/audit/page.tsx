import { Container, PageHeader } from '@pos-tercos/ui';
import { History } from 'lucide-react';
import { AuditTable } from '../../../features/audit';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import { requireRole } from '../../../lib/guards';
import type { AuditLogEntry } from '@pos-tercos/types';

async function loadAudit(): Promise<AuditLogEntry[] | { error: string; status?: number }> {
  try {
    return await serverFetchJson<AuditLogEntry[]>('/audit?limit=200');
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        error:
          err.status === 403
            ? 'Solo el Dueño puede ver el registro de auditoría.'
            : `Error del servidor (${err.status})`,
        status: err.status,
      };
    }
    return { error: 'Error de conexión' };
  }
}

export default async function AuditPage() {
  await requireRole(['DUENO']);
  const result = await loadAudit();

  return (
    <>
      <PageHeader
        eyebrow="Control"
        title="Auditoría"
        description="Registro que no se puede modificar de todas las acciones sensibles: inicios de sesión, cambios de catálogo, movimientos de inventario, anulaciones, descuentos, aperturas de cajón y ajustes manuales."
        icon={<History className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <AuditTable rows={result} />
        ) : (
          <p
            role="alert"
            className={`rounded-md border px-3 py-2 text-sm ${
              result.status === 403
                ? 'border-warning-border bg-warning-bg text-warning'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
