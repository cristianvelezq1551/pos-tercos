import Link from 'next/link';
import { Button } from '@pos-tercos/ui';
import { InvoicesTable } from '../../../features/invoices';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Invoice } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

async function loadInvoices(status?: string): Promise<Invoice[] | { error: string }> {
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return await serverFetchJson<Invoice[]>(`/invoices${qs}`);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'PENDING_REVIEW', label: 'Pendientes' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
];

export default async function InvoicesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadInvoices(sp.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturas</h1>
          <p className="mt-1 text-sm text-gray-600">
            Histórico de facturas de proveedor procesadas con IA. Subí una foto y la IA extrae los
            ítems para que los revises antes de confirmar.
          </p>
        </div>
        <Link href="/invoices/new">
          <Button size="sm">Nueva factura</Button>
        </Link>
      </div>

      <nav className="flex gap-2 text-sm">
        {STATUS_FILTERS.map((f) => {
          const active = (sp.status ?? '') === f.value;
          return (
            <Link
              key={f.value}
              href={f.value ? `/invoices?status=${f.value}` : '/invoices'}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {Array.isArray(result) ? (
        <InvoicesTable rows={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las facturas. {result.error}
        </p>
      )}
    </div>
  );
}
