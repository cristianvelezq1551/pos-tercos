import Link from 'next/link';
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

async function loadAll(onlyOpen: boolean): Promise<
  | { attendance: WorkerAttendance[]; users: WorkerOption[] }
  | { error: string }
> {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asistencia</h1>
        <p className="mt-1 text-sm text-gray-600">
          Registrá la entrada y salida de los trabajadores. Las horas se
          calculan automáticamente al cerrar el turno.
        </p>
        <nav className="mt-3 flex gap-2 text-sm">
          <SubNav href="/workers/attendance" label="Asistencia" active />
          <SubNav href="/workers/commissions" label="Comisiones" />
          <SubNav href="/workers/payroll" label="Período (payroll)" />
        </nav>
      </div>

      {'error' in result ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los datos. {result.error}
        </p>
      ) : (
        <>
          <CheckInForm workers={result.users} />

          <div className="flex items-center gap-3">
            <Link
              href="/workers/attendance"
              className={`rounded-md border px-3 py-1.5 text-sm ${
                !onlyOpen
                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Todos
            </Link>
            <Link
              href="/workers/attendance?only_open=true"
              className={`rounded-md border px-3 py-1.5 text-sm ${
                onlyOpen
                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Solo abiertos
            </Link>
          </div>

          <AttendanceTable attendance={result.attendance} />
        </>
      )}
    </div>
  );
}

function SubNav({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </Link>
  );
}
