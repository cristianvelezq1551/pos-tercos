import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { IngredientsTable } from '../../../features/ingredients';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Ingredient } from '@pos-tercos/types';

async function loadIngredients(): Promise<Ingredient[] | { error: string }> {
  try {
    return await serverFetchJson<Ingredient[]>('/ingredients');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function IngredientsPage() {
  const result = await loadIngredients();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Insumos"
        description="Materias primas que comprás a proveedores. Define unidad de compra, unidad de receta y factor de conversión."
        icon={<BrandIcon name="flame" className="h-6 w-6" />}
        actions={
          <Link href="/ingredients/new">
            <Button>Nuevo insumo</Button>
          </Link>
        }
      />

      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <IngredientsTable ingredients={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los insumos. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
