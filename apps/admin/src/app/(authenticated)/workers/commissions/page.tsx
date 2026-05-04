import Link from 'next/link';
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
  | { commissions: WorkerCommission[]; users: WorkerOption[] }
  | { error: string }
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comisiones</h1>
        <p className="mt-1 text-sm text-gray-600">
          Configurá comisiones por trabajador. PERCENT_OF_SHIFT se aplica
          al revenue del turno (cajero); FIXED_PER_SALE es un monto por venta.
        </p>
        <nav className="mt-3 flex gap-2 text-sm">
          <SubNav href="/workers/attendance" label="Asistencia" />
          <SubNav href="/workers/commissions" label="Comisiones" active />
          <SubNav href="/workers/payroll" label="Período (payroll)" />
        </nav>
      </div>

      {'error' in result ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los datos. {result.error}
        </p>
      ) : (
        <CommissionsList
          commissions={result.commissions}
          workers={result.users}
        />
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
