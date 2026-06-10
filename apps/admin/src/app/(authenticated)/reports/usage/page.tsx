import { Container, PageHeader } from '@pos-tercos/ui';
import { Recycle } from 'lucide-react';
import { RangeFilter } from '../../../../features/reports-sales';
import { UsageTable } from '../../../../features/reports-usage';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import type { InventoryUsageReport } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

async function loadReport(
  from: string | undefined,
  to: string | undefined,
): Promise<InventoryUsageReport | { error: string }> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const path = `/reports/inventory-usage${qs.toString() ? `?${qs.toString()}` : ''}`;
  try {
    return await serverFetchJson<InventoryUsageReport>(path);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function ReportsUsagePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadReport(sp.from, sp.to);

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Uso y mermas de insumos"
        description="Cuánto consumió la venta y la producción de cada insumo, cuánto se declaró como merma y cuánta plata se está perdiendo fuera de la caja."
        icon={<Recycle className="h-6 w-6" strokeWidth={1.75} />}
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
            <UsageTable report={result} />
          )}
        </div>
      </Container>
    </>
  );
}
