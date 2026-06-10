import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { SubproductsTable } from '../../../features/subproducts';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import { getCurrentUserServer } from '../../../features/auth/server';
import type { Stockable, Subproduct, SubproductCostSummary } from '@pos-tercos/types';

async function loadSubproducts(): Promise<
  {
    subproducts: Subproduct[];
    costById: Map<string, number | null>;
    stockById: Map<string, number>;
  } | { error: string }
> {
  try {
    const [subproducts, costs, stockables] = await Promise.all([
      serverFetchJson<Subproduct[]>('/subproducts'),
      // El costo es secundario: si falla, mostramos la tabla igual sin costos.
      serverFetchJson<SubproductCostSummary[]>('/subproduct-costs').catch(() => []),
      // Stock de subproductos para la columna nueva.
      serverFetchJson<Stockable[]>('/inventory/stock').catch(() => []),
    ]);
    const costById = new Map(costs.map((c) => [c.subproductId, c.totalCost]));
    const stockById = new Map<string, number>();
    for (const s of stockables) {
      if (s.type === 'SUBPRODUCT') stockById.set(s.id, s.currentStock);
    }
    return { subproducts, costById, stockById };
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function SubproductsPage() {
  const [result, user] = await Promise.all([loadSubproducts(), getCurrentUserServer()]);

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Subproductos"
        description="Intermedios cocinados que se usan en la receta de productos vendibles. Definí el rendimiento (porciones por preparación) para que el sistema calcule el consumo proporcional."
        icon={<BrandIcon name="knife" className="h-6 w-6" />}
        actions={
          <Link href="/subproducts/new">
            <Button>Nuevo subproducto</Button>
          </Link>
        }
      />
      <Container size="7xl" padY="md">
        {!('error' in result) ? (
          <SubproductsTable
            subproducts={result.subproducts}
            costById={result.costById}
            stockById={result.stockById}
            userRole={user?.role}
          />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los subproductos. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
