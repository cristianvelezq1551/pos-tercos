import { Container, PageHeader } from '@pos-tercos/ui';
import { ProductForm } from '../../../../features/products';
import { serverFetchJson } from '../../../../lib/api-server';
import type { Product } from '@pos-tercos/types';

export default async function NewProductPage() {
  // Candidatos para componentes de combo (activos; el form excluye combos).
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
        title="Nuevo producto"
        description="Elegí el tipo de producto y completá los datos. Combos y variantes se arman acá mismo."
        breadcrumbs={[
          { label: 'Productos', href: '/products' },
          { label: 'Nuevo' },
        ]}
      />
      <Container size="4xl" padY="md">
        <ProductForm comboCandidates={candidates} />
      </Container>
    </>
  );
}
