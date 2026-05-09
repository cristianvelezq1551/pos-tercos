import { Container, PageHeader } from '@pos-tercos/ui';
import { Wallet } from 'lucide-react';
import { ShiftsTable } from '../../../features/shifts';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Shift } from '@pos-tercos/types';

async function loadShifts(): Promise<Shift[] | { error: string }> {
  try {
    return await serverFetchJson<Shift[]>('/shifts?limit=100');
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function ShiftsPage() {
  const result = await loadShifts();

  return (
    <>
      <PageHeader
        eyebrow="Caja"
        title="Turnos"
        description="Histórico de aperturas y cierres. La diferencia mayor o igual a $5.000 dispara alerta de anomalía en el registro de auditoría."
        icon={<Wallet className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <ShiftsTable shifts={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los turnos. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
