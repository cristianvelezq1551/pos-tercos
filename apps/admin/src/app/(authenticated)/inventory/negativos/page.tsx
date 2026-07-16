import Link from 'next/link';
import { Container, PageHeader } from '@pos-tercos/ui';
import { TrendingDown } from 'lucide-react';
import { NegativeStockTable } from '../../../../features/inventory';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import type { Stockable } from '@pos-tercos/types';

async function loadNegatives(): Promise<Stockable[] | { error: string }> {
  try {
    return await serverFetchJson<Stockable[]>('/inventory/stock?negative=true');
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function NegativeStockPage() {
  const result = await loadNegatives();
  const all = Array.isArray(result) ? result : [];
  // Los consumibles (servilletas, sal) viven en negativo por diseño: se separan
  // para no tapar la deuda que sí pide acción.
  const rows = all.filter((s) => s.blocksAvailability);
  const consumibles = all.filter((s) => !s.blocksAvailability);

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Deudas de inventario"
        description="Insumos en negativo: se vendió o consumió más de lo que está registrado. No es un error de la caja — es stock que existe físicamente pero al que le falta su respaldo en el sistema."
        icon={<TrendingDown className="h-6 w-6" strokeWidth={1.75} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/inventory"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              Ver existencias
            </Link>
            <Link
              href="/inventory/counts"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              Conteo físico
            </Link>
          </div>
        }
      />
      <Container size="7xl" padY="md">
        {!Array.isArray(result) ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudo cargar la deuda de inventario. {result.error}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {rows.length > 0 ? (
              <div
                role="alert"
                className="rounded-2xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning"
              >
                <p className="font-semibold">Qué significa esto</p>
                <p className="mt-1 text-warning/90">
                  Cada fila salió en negativo porque se vendió (o se forzó la venta de) algo sin que
                  su entrada estuviera cargada. Casi siempre es una{' '}
                  <strong>factura que falta subir</strong> o una{' '}
                  <strong>producción que no se registró</strong>. Al cargarla, el sistema salda la
                  deuda y le asigna el costo real a esas ventas de forma retroactiva — el margen se
                  corrige solo.
                </p>
                <p className="mt-2 text-warning/90">
                  Si ya cargaste todo y aun así queda en negativo, la diferencia es real: hacé un{' '}
                  <Link href="/inventory/counts" className="font-semibold underline">
                    conteo físico
                  </Link>{' '}
                  para dejar el stock en lo que hay de verdad.
                </p>
              </div>
            ) : null}
            <NegativeStockTable rows={rows} />

            {consumibles.length > 0 ? (
              <details className="rounded-2xl border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                  {consumibles.length === 1
                    ? '1 consumible en negativo'
                    : `${consumibles.length} consumibles en negativo`}
                  <span className="ml-2 font-normal text-muted-foreground">
                    (servilletas, sal…) — esperable, no pide acción
                  </span>
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Marcaste estos insumos como consumibles: no frenan la venta y su stock queda en
                  negativo hasta que subas su factura. Se costean igual, al último precio conocido.
                </p>
                <div className="mt-3">
                  <NegativeStockTable rows={consumibles} />
                </div>
              </details>
            ) : null}
          </div>
        )}
      </Container>
    </>
  );
}
