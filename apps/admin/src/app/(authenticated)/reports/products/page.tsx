import { Container, PageHeader } from '@pos-tercos/ui';
import { BarChart3 } from 'lucide-react';
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
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Top productos y márgenes"
        description="Productos ordenados por ingresos. Costo y margen estimados desde la receta y el último costo unitario de los insumos."
        icon={<BarChart3 className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-5">
          <RangeFilter />
          {'error' in result ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudo cargar el reporte. {result.error}
            </p>
          ) : (
            <TopProductsTable report={result} />
          )}
        </div>
      </Container>
    </>
  );
}
