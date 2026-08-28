import { Container, PageHeader } from '@pos-tercos/ui';
import { Truck } from 'lucide-react';
import { PurchasesReportSchema, type PurchasesReport } from '@pos-tercos/types';
import { RangeFilter } from '../../../../features/reports-sales';
import {
  PurchaseGranularityToggle,
  PurchasePeriodsTable,
  PurchaseSuppliersTable,
  PurchasesSummary,
} from '../../../../features/reports-purchases';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import { requireRole } from '../../../../lib/guards';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; granularity?: string }>;
}

async function loadReport(
  sp: Awaited<PageProps['searchParams']>,
): Promise<PurchasesReport | { error: string }> {
  const qs = new URLSearchParams();
  if (sp.from) qs.set('from', sp.from);
  if (sp.to) qs.set('to', sp.to);
  if (sp.granularity) qs.set('granularity', sp.granularity);
  const path = `/reports/purchases${qs.toString() ? `?${qs.toString()}` : ''}`;
  try {
    return await serverFetchJson(path, undefined, PurchasesReportSchema);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function ReportsPurchasesPage({ searchParams }: PageProps) {
  // Muestra costos y totales por proveedor: solo el Dueño (el endpoint ya es
  // @OnlyDueno; esto es defensa en profundidad, igual que en los otros reportes).
  await requireRole(['DUENO']);
  const sp = await searchParams;
  const result = await loadReport(sp);

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Compras y domicilios"
        description="Cuánto compraste y cuánto te cobraron por traértelo, semana por semana y proveedor por proveedor. El porcentaje es el número con el que se negocia."
        icon={<Truck className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RangeFilter />
            <PurchaseGranularityToggle />
          </div>

          {'error' in result ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudo cargar el reporte. {result.error}
            </p>
          ) : (
            <>
              <PurchasesSummary report={result} />
              <PurchasePeriodsTable report={result} />
              <PurchaseSuppliersTable report={result} />
              <p className="text-xs text-muted-foreground">
                Cuenta las facturas por la fecha en que las registraste, no por la fecha impresa
                en el papel. Sube cada factura el día que llega la mercancía y los cortes por
                semana van a cuadrar.
              </p>
            </>
          )}
        </div>
      </Container>
    </>
  );
}
