import Link from 'next/link';
import { Container, PageHeader } from '@pos-tercos/ui';
import { Box } from 'lucide-react';
import { StockTable } from '../../../features/inventory';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { Stockable } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ low_stock?: string }>;
}

async function loadStock(lowStockOnly: boolean): Promise<Stockable[] | { error: string }> {
  try {
    const params = lowStockOnly ? '?low_stock=true' : '';
    return await serverFetchJson<Stockable[]>(`/inventory/stock${params}`);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const lowStockOnly = sp.low_stock === 'true';
  const result = await loadStock(lowStockOnly);

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Existencias"
        description="Cantidad actual de cada insumo, calculada como la suma de todos los movimientos. Las filas por debajo del mínimo se resaltan en ámbar."
        icon={<Box className="h-6 w-6" strokeWidth={1.75} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={lowStockOnly ? '/inventory' : '/inventory?low_stock=true'}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              {lowStockOnly ? 'Ver todos' : 'Solo bajo mínimo'}
            </Link>
            <Link
              href="/inventory/movements"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              Ver movimientos
            </Link>
          </div>
        }
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <StockTable rows={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudo cargar el inventario. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
