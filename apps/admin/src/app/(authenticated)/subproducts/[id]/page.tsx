import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { SubproductForm } from '../../../../features/subproducts';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Subproduct } from '@pos-tercos/types';

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

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={subproduct.name}
        description="Edita los datos del subproducto."
        breadcrumbs={[
          { label: 'Subproductos', href: '/subproducts' },
          { label: subproduct.name },
        ]}
      />
      <Container size="4xl" padY="md">
        <SubproductForm initial={subproduct} />
      </Container>
    </>
  );
}
