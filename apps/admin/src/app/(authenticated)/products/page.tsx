import Link from 'next/link';
import { Button } from '@pos-tercos/ui';
import { ProductsTable } from '../../../features/products';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { ExpandedCostResponse, Product } from '@pos-tercos/types';

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

/**
 * Pre-fetch en paralelo del expanded-cost de todos los productos. La UI
 * lo usa para mostrar costo + margen consistentes (combos + recetas +
 * direct-resale). Si una llamada individual falla, se omite ese producto
 * (UI muestra "—").
 */
async function loadCostsByProductId(
  products: Product[],
): Promise<Map<string, ExpandedCostResponse>> {
  const map = new Map<string, ExpandedCostResponse>();
  await Promise.all(
    products.map(async (p) => {
      try {
        const cost = await serverFetchJson<ExpandedCostResponse>(
          `/products/${p.id}/expanded-cost`,
        );
        map.set(p.id, cost);
      } catch {
        // omit — UI fallback
      }
    }),
  );
  return map;
}

export default async function ProductsPage() {
  const result = await loadProducts();
  const costsById = Array.isArray(result)
    ? await loadCostsByProductId(result)
    : new Map<string, ExpandedCostResponse>();

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
        <ProductsTable products={result} costsById={costsById} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los productos. {result.error}
        </p>
      )}
    </div>
  );
}
