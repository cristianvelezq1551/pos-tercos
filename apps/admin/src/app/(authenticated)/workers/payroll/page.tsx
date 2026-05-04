import Link from 'next/link';
import { PayrollPeriodTable } from '../../../../features/workers';
import { RangeFilter } from '../../../../features/reports-sales';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { PayrollPeriodReport } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 13);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(today) };
}

async function loadReport(
  from: string,
  to: string,
): Promise<PayrollPeriodReport | { error: string }> {
  try {
    return await serverFetchJson<PayrollPeriodReport>(
      `/workers/payroll-period?from=${from}&to=${to}`,
    );
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function PayrollPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;
  const result = await loadReport(from, to);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payroll del período</h1>
        <p className="mt-1 text-sm text-gray-600">
          Total de horas y comisión estimada por trabajador en el rango.
          Útil como preview de pago — no genera asientos contables ni
          movimientos en caja.
        </p>
        <nav className="mt-3 flex gap-2 text-sm">
          <SubNav href="/workers/attendance" label="Asistencia" />
          <SubNav href="/workers/commissions" label="Comisiones" />
          <SubNav href="/workers/payroll" label="Período (payroll)" active />
        </nav>
      </div>

      <RangeFilter />

      {'error' in result ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el reporte. {result.error}
        </p>
      ) : (
        <PayrollPeriodTable report={result} />
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
