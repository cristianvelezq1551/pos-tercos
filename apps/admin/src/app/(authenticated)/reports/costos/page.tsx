import { Container, PageHeader, Section } from '@pos-tercos/ui';
import { Coins } from 'lucide-react';
import type {
  InventoryValuationReport,
  PnlReport,
  ProductMarginReport,
} from '@pos-tercos/types';
import {
  CogsPnlSummary,
  InventoryValuationTable,
  ProductMarginsTable,
} from '../../../../features/reports-cogs';
import { RangeFilter } from '../../../../features/reports-sales';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import { requireRole } from '../../../../lib/guards';

interface Data {
  pnl: PnlReport;
  margins: ProductMarginReport;
  valuation: InventoryValuationReport;
}

async function load(qs: string): Promise<Data | { error: string }> {
  try {
    const [pnl, margins, valuation] = await Promise.all([
      serverFetchJson<PnlReport>(`/reports/cogs/pnl${qs}`),
      serverFetchJson<ProductMarginReport>(`/reports/cogs/product-margins${qs}`),
      serverFetchJson<InventoryValuationReport>('/reports/cogs/inventory-valuation'),
    ]);
    return { pnl, margins, valuation };
  } catch (err) {
    if (err instanceof ApiError) return { error: friendlyApiError(err) };
    return { error: friendlyApiError(err) };
  }
}

export default async function CostosPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole(['DUENO']);
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.from) params.set('from', sp.from);
  if (sp.to) params.set('to', sp.to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const result = await load(qs);

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Costos y margen real"
        description="Costeo FIFO: cuánto costó realmente lo vendido (no estimado), cuánto ganaste y el valor real de tu inventario. Los precios de venta son fijos; aquí ves el costo dinámico."
        icon={<Coins className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {'error' in result ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {result.error}
          </p>
        ) : (
          <div className="space-y-10">
            <Section eyebrow="Período" title="Estado de resultados (ganancia bruta real)" size="md">
              <div className="space-y-4">
                <RangeFilter />
                <CogsPnlSummary pnl={result.pnl} />
              </div>
            </Section>

            <Section eyebrow="Detalle" title="Margen real por producto" size="md">
              <ProductMarginsTable report={result.margins} />
            </Section>

            <Section
              eyebrow="Bodega"
              title="Inventario valorizado (a hoy)"
              size="md"
            >
              <InventoryValuationTable report={result.valuation} />
            </Section>
          </div>
        )}
      </Container>
    </>
  );
}
