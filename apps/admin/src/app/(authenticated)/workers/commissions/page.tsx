import Link from 'next/link';
import { Chip, Container, PageHeader } from '@pos-tercos/ui';
import { Coins } from 'lucide-react';
import { CommissionsList } from '../../../../features/workers';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { WorkerCommission } from '@pos-tercos/types';

interface WorkerOption {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

async function loadAll(): Promise<
  { commissions: WorkerCommission[]; users: WorkerOption[] } | { error: string }
> {
  try {
    const [commissions, users] = await Promise.all([
      serverFetchJson<WorkerCommission[]>('/workers/commissions'),
      serverFetchJson<WorkerOption[]>('/workers/users'),
    ]);
    return { commissions, users };
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function CommissionsPage() {
  const result = await loadAll();
  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Comisiones"
        description="Configura comisiones por trabajador. Porcentaje del turno se aplica al ingreso del turno (cajero); monto fijo es un valor por venta."
        icon={<Coins className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <nav className="mb-5 flex flex-wrap gap-2">
          <Link href="/workers/attendance">
            <Chip type="button">Asistencia</Chip>
          </Link>
          <Link href="/workers/commissions">
            <Chip selected type="button">
              Comisiones
            </Chip>
          </Link>
          <Link href="/workers/payroll">
            <Chip type="button">Nómina del período</Chip>
          </Link>
        </nav>

        {'error' in result ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los datos. {result.error}
          </p>
        ) : (
          <CommissionsList commissions={result.commissions} workers={result.users} />
        )}
      </Container>
    </>
  );
}
