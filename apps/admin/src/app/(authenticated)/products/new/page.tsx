import { Container, PageHeader } from '@pos-tercos/ui';
import { ProductForm } from '../../../../features/products';
import { serverFetchJson } from '../../../../lib/api-server';
import type { Product, ProductCategory } from '@pos-tercos/types';

export default async function NewProductPage() {
  // Candidatos para componentes de combo (activos; el form excluye combos).
  let candidates: Product[] = [];
  try {
    candidates = await serverFetchJson<Product[]>('/products?only_active=true');
  } catch {
    candidates = [];
  }

  const categories = await loadCategoryNames();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Nuevo producto"
        description="Elige el tipo de producto y completa los datos. Combos y variantes se arman aquí mismo."
        breadcrumbs={[
          { label: 'Productos', href: '/products' },
          { label: 'Nuevo' },
        ]}
      />
      <Container size="4xl" padY="md">
        <ProductForm comboCandidates={candidates} categories={categories} />
      </Container>
    </>
  );
}

async function loadCategoryNames(): Promise<string[]> {
  try {
    const cats = await serverFetchJson<ProductCategory[]>('/product-categories?only_active=true');
    return cats.map((c) => c.name);
  } catch {
    return [];
  }
}
