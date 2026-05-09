import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { PromotionDetail } from '../../../../features/promotions';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Product, Promotion } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PromotionDetailPage({ params }: PageProps) {
  const { id } = await params;

  let promotion: Promotion;
  try {
    promotion = await serverFetchJson<Promotion>(`/promotions/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let products: Product[] = [];
  try {
    products = await serverFetchJson<Product[]>('/products');
  } catch {
    products = [];
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={promotion.name}
        description="Detalle de la promoción."
        breadcrumbs={[
          { label: 'Promociones', href: '/promotions' },
          { label: promotion.name },
        ]}
      />
      <Container size="6xl" padY="md">
        <PromotionDetail promotion={promotion} products={products} />
      </Container>
    </>
  );
}
