import Link from 'next/link';
import { Chip, Container, PageHeader } from '@pos-tercos/ui';
import { UserCheck } from 'lucide-react';
import {
  AttendanceTable,
  CheckInForm,
} from '../../../../features/workers';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { WorkerAttendance } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ only_open?: string }>;
}

interface WorkerOption {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

async function loadAll(
  onlyOpen: boolean,
): Promise<{ attendance: WorkerAttendance[]; users: WorkerOption[] } | { error: string }> {
  try {
    const qs = onlyOpen ? '?only_open=true' : '';
    const [attendance, users] = await Promise.all([
      serverFetchJson<WorkerAttendance[]>(`/workers/attendance${qs}`),
      serverFetchJson<WorkerOption[]>('/workers/users'),
    ]);
    return { attendance, users };
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const onlyOpen = sp.only_open === 'true';
  const result = await loadAll(onlyOpen);

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Asistencia"
        description="Registra la entrada y salida de los trabajadores. Las horas se calculan automáticamente al cerrar el turno."
        icon={<UserCheck className="h-6 w-6" strokeWidth={1.75} />}
      />

      <Container size="7xl" padY="md">
        <nav className="mb-5 flex flex-wrap gap-2">
          <Link href="/workers/attendance">
            <Chip selected type="button">
              Asistencia
            </Chip>
          </Link>
          <Link href="/workers/commissions">
            <Chip type="button">Comisiones</Chip>
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
          <div className="space-y-6">
            <CheckInForm workers={result.users} />

            <div className="flex flex-wrap gap-2">
              <Link href="/workers/attendance">
                <Chip selected={!onlyOpen} type="button">
                  Todos
                </Chip>
              </Link>
              <Link href="/workers/attendance?only_open=true">
                <Chip selected={onlyOpen} type="button">
                  Solo abiertos
                </Chip>
              </Link>
            </div>

            <AttendanceTable attendance={result.attendance} />
          </div>
        )}
      </Container>
    </>
  );
}
