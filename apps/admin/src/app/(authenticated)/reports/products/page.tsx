import { Container, PageHeader } from '@pos-tercos/ui';
import { BarChart3 } from 'lucide-react';
import { RangeFilter } from '../../../../features/reports-sales';
import { TopProductsTable } from '../../../../features/reports-products';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import type { TopProductsReport } from '@pos-tercos/types';
import { requireRole } from '../../../../lib/guards';

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
    return { error: friendlyApiError(err) };
  }
}

export default async function ReportsProductsPage({ searchParams }: PageProps) {
  // Reportes financieros: solo el Dueño (defensa en profundidad — el endpoint ya es @OnlyDueno).
  await requireRole(['DUENO']);
  const sp = await searchParams;
  const result = await loadReport(sp.from, sp.to, sp.limit ?? '20');

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Productos más vendidos y márgenes"
        description="Tus productos ordenados por ingresos. El costo y el margen se estiman con la receta y el último costo de los insumos."
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
