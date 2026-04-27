import Link from 'next/link';
import { Button } from '@pos-tercos/ui';
import { ProductsTable } from '../../../features/products';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Product } from '@pos-tercos/types';

async function loadProducts(): Promise<Product[] | { error: string }> {
  try {
    return await serverFetchJson<Product[]>('/products');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function ProductsPage() {
  const result = await loadProducts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Lo que vendés en mostrador. Marcá un producto como combo si está compuesto por otros
            productos con un precio especial.
          </p>
        </div>
        <Link href="/products/new">
          <Button size="sm">Nuevo producto</Button>
        </Link>
      </div>

      {Array.isArray(result) ? (
        <ProductsTable products={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los productos. {result.error}
        </p>
      )}
    </div>
  );
}
