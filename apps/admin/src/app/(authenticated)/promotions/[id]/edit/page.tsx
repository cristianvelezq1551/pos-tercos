import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { PromotionForm } from '../../../../../features/promotions';
import { ApiError, serverFetchJson } from '../../../../../lib/api-server';
import type { Promotion } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PromotionEditPage({ params }: PageProps) {
  const { id } = await params;

  let promotion: Promotion;
  try {
    promotion = await serverFetchJson<Promotion>(`/promotions/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={`Editar: ${promotion.name}`}
        description="Cambia días, horario, vigencia o productos. El tipo y el descuento son fijos: para modificarlos, desactiva esta promo y crea una nueva."
        breadcrumbs={[
          { label: 'Promociones', href: '/promotions' },
          { label: promotion.name, href: `/promotions/${promotion.id}` },
          { label: 'Editar' },
        ]}
      />
      <Container size="6xl" padY="md">
        <PromotionForm initial={promotion} />
      </Container>
    </>
  );
}
