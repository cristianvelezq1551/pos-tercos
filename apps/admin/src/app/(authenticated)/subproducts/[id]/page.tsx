import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { SubproductForm, SubproductStockPanel } from '../../../../features/subproducts';
import { getCurrentUserServer } from '../../../../features/auth/server';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { InventoryMovement, Stockable, Subproduct } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSubproductPage({ params }: PageProps) {
  const { id } = await params;

  let subproduct: Subproduct;
  try {
    subproduct = await serverFetchJson<Subproduct>(`/subproducts/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Stock + últimos movimientos en paralelo. Tolera fallo: si /inventory/stock
  // se cae, la página igual renderiza el form.
  const [stock, movements, user] = await Promise.all([
    serverFetchJson<Stockable>(`/inventory/stock/SUBPRODUCT/${id}`).catch(() => null),
    serverFetchJson<InventoryMovement[]>(
      `/inventory/movements?subproduct_id=${id}&limit=15`,
    ).catch(() => []),
    getCurrentUserServer(),
  ]);

  const canProduce = user?.role === 'DUENO' || user?.role === 'ADMIN_OPERATIVO';

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={subproduct.name}
        description="Edita los datos del subproducto y gestiona su stock de producción."
        breadcrumbs={[
          { label: 'Subproductos', href: '/subproducts' },
          { label: subproduct.name },
        ]}
      />
      <Container size="7xl" padY="md">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <SubproductForm initial={subproduct} />
          <SubproductStockPanel
            subproduct={subproduct}
            stock={stock}
            movements={movements}
            canProduce={canProduce}
          />
        </div>
      </Container>
    </>
  );
}
