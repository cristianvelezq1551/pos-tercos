import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { ProductsTable } from '../../../features/products';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import { getCurrentUserServer } from '../../../features/auth/server';
import type { Product, ProductCostSummary } from '@pos-tercos/types';

async function loadProducts(): Promise<Product[] | { error: string }> {
  try {
    return await serverFetchJson<Product[]>('/products');
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

// Costos de TODOS los productos en una sola request (batch) — antes era un N+1
// que pedía `/products/:id/expanded-cost` por cada producto y demoraba la página.
async function loadCostsByProductId(): Promise<Map<string, ProductCostSummary>> {
  try {
    const costs = await serverFetchJson<ProductCostSummary[]>('/product-costs');
    return new Map(costs.map((c) => [c.productId, c]));
  } catch {
    return new Map(); // sin costos → la tabla cae a su fallback
  }
}

export default async function ProductsPage() {
  const [result, user, costsById] = await Promise.all([
    loadProducts(),
    getCurrentUserServer(),
    loadCostsByProductId(),
  ]);

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
