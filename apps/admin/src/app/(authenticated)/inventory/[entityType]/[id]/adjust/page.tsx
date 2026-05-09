import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { AdjustStockForm } from '../../../../../../features/inventory';
import { ApiError, serverFetchJson } from '../../../../../../lib/api-server';
import { StockableTypeEnum, type Stockable } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ entityType: string; id: string }>;
}

export default async function AdjustStockPage({ params }: PageProps) {
  const { entityType, id } = await params;

  const parsed = StockableTypeEnum.safeParse(entityType.toUpperCase());
  if (!parsed.success) notFound();

  let stockable: Stockable;
  try {
    stockable = await serverFetchJson<Stockable>(
      `/inventory/stock/${parsed.data.toLowerCase()}/${id}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Ajustar existencias"
        description="Registra un movimiento manual. La acción queda en la bitácora de auditoría."
        breadcrumbs={[
          { label: 'Existencias', href: '/inventory' },
          { label: stockable.name },
          { label: 'Ajustar' },
        ]}
      />
      <Container size="4xl" padY="md">
        <AdjustStockForm stockable={stockable} />
      </Container>
    </>
  );
}
