import { RangeFilter } from '../../../../features/reports-sales';
import { TopProductsTable } from '../../../../features/reports-products';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { TopProductsReport } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; limit?: string }>;
}

async function loadReport(
  from: string | undefined,
  to: string | undefined,
  limit: string | undefined,
): Promise<TopProductsReport | { error: string }> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (limit) qs.set('limit', limit);
  const path = `/reports/top-products${qs.toString() ? `?${qs.toString()}` : ''}`;
  try {
    return await serverFetchJson<TopProductsReport>(path);
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function ReportsProductsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadReport(sp.from, sp.to, sp.limit ?? '20');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Top productos y márgenes</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ordenados por revenue. Costo y margen estimados desde la receta del
          producto + <code>lastUnitCost</code> de los insumos.
        </p>
      </div>

      <RangeFilter />

      {'error' in result ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el reporte. {result.error}
        </p>
      ) : (
        <TopProductsTable report={result} />
      )}
    </div>
  );
}
