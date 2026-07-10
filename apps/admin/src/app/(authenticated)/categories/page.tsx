import { Container, PageHeader } from '@pos-tercos/ui';
import { Shapes } from 'lucide-react';
import { CategoriesManager } from '../../../features/categories';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { ProductCategory } from '@pos-tercos/types';

async function loadCategories(): Promise<ProductCategory[] | { error: string }> {
  try {
    return await serverFetchJson<ProductCategory[]>('/product-categories');
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function CategoriesPage() {
  const result = await loadCategories();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Categorías"
        description="Definí las categorías del menú una sola vez. Al crear un producto se elige de esta lista, así no se duplican por errores de tipeo."
        icon={<Shapes className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="2xl" padY="md">
        {Array.isArray(result) ? (
          <CategoriesManager initial={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
