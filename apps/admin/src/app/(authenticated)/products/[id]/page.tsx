import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { ProductForm } from '../../../../features/products';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Product } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;

  let product: Product;
  try {
    product = await serverFetchJson<Product>(`/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Candidatos para componentes de combo (activos; el form excluye combos + el propio).
  let candidates: Product[] = [];
  try {
    candidates = await serverFetchJson<Product[]>('/products?only_active=true');
  } catch {
    candidates = [];
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={product.name}
        description="Edita los datos del producto. Los cambios se aplican inmediatamente al catálogo."
        breadcrumbs={[
          { label: 'Productos', href: '/products' },
          { label: product.name },
        ]}
      />
      <Container size="4xl" padY="md">
        <ProductForm initial={product} comboCandidates={candidates} />
      </Container>
    </>
  );
}
