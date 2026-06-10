import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { ProductsTable } from '../../../features/products';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import { getCurrentUserServer } from '../../../features/auth/server';
import type { ExpandedCostResponse, Product } from '@pos-tercos/types';

async function loadProducts(): Promise<Product[] | { error: string }> {
  try {
    return await serverFetchJson<Product[]>('/products');
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

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
  const [result, user] = await Promise.all([loadProducts(), getCurrentUserServer()]);
  const costsById = Array.isArray(result)
    ? await loadCostsByProductId(result)
    : new Map<string, ExpandedCostResponse>();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Lo que vendes en mostrador. Marca un producto como combo si está compuesto por otros con precio especial."
        icon={<BrandIcon name="burger" className="h-6 w-6" />}
        actions={
          <Link href="/products/new">
            <Button>Nuevo producto</Button>
          </Link>
        }
      />

      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <ProductsTable products={result} costsById={costsById} userRole={user?.role} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los productos. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
