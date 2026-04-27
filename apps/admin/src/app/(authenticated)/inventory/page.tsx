import Link from 'next/link';
import { StockTable } from '../../../features/inventory';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Stockable } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ low_stock?: string }>;
}

async function loadStock(lowStockOnly: boolean): Promise<Stockable[] | { error: string }> {
  try {
    const params = lowStockOnly ? '?low_stock=true' : '';
    return await serverFetchJson<Stockable[]>(`/inventory/stock${params}`);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const lowStockOnly = sp.low_stock === 'true';
  const result = await loadStock(lowStockOnly);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-gray-600">
            Stock actual de cada insumo, calculado como la suma de todos los movimientos. Las filas
            con stock bajo el threshold quedan destacadas en ámbar.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={lowStockOnly ? '/inventory' : '/inventory?low_stock=true'}
            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {lowStockOnly ? 'Ver todos' : 'Solo stock crítico'}
          </Link>
          <Link
            href="/inventory/movements"
            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ver movimientos
          </Link>
        </div>
      </div>

      {Array.isArray(result) ? (
        <StockTable rows={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el inventario. {result.error}
        </p>
      )}
    </div>
  );
}
