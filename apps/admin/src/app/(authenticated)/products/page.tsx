import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { ProductsList, type RealCost } from '../../../features/products';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import { getCurrentUserServer } from '../../../features/auth/server';
import type { Product, ProductCostWithVariants, ProductMarginReport } from '@pos-tercos/types';

async function loadProducts(): Promise<Product[] | { error: string }> {
  try {
    return await serverFetchJson<Product[]>('/products');
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

// Costos de TODOS los productos en una sola request (batch) — antes era un N+1
// que pedía `/products/:id/expanded-cost` por cada producto y demoraba la página.
// Con variantes: en un producto con tamaños, el costo de la receta base es el de
// un plato que no se puede comprar (elegir variante es obligatorio para vender).
async function loadCostsByProductId(): Promise<Map<string, ProductCostWithVariants>> {
  try {
    const costs = await serverFetchJson<ProductCostWithVariants[]>('/product-costs/with-variants');
    return new Map(costs.map((c) => [c.productId, c]));
  } catch {
    return new Map(); // sin costos → la tabla cae a su fallback
  }
}

// Costo REAL de lo vendido (FIFO) para contrastarlo contra el estimado en la
// misma fila. El reporte es del dueño: para otros roles falla y la tabla
// simplemente no muestra esas columnas.
async function loadRealCostsByProductId(): Promise<Map<string, RealCost>> {
  try {
    const report = await serverFetchJson<ProductMarginReport>('/reports/cogs/product-margins');
    return new Map(
      report.products.map((p) => [
        p.productId,
        {
          unitCost: p.unitsSold > 0 ? p.cogs / p.unitsSold : null,
          marginPct: p.marginPct === null ? null : p.marginPct * 100,
          partial: p.cogsPartial,
        },
      ]),
    );
  } catch {
    return new Map();
  }
}

export default async function ProductsPage() {
  const [result, user, costsById, realCostById] = await Promise.all([
    loadProducts(),
    getCurrentUserServer(),
    loadCostsByProductId(),
    loadRealCostsByProductId(),
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
          <ProductsList
            products={result}
            costsById={costsById}
            realCostById={realCostById}
            userRole={user?.role}
          />
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
