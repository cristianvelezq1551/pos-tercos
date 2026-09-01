import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { IngredientsList } from '../../../features/ingredients';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import { getCurrentUserServer } from '../../../features/auth/server';
import type { Ingredient } from '@pos-tercos/types';

async function loadIngredients(): Promise<Ingredient[] | { error: string }> {
  try {
    return await serverFetchJson<Ingredient[]>('/ingredients');
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function IngredientsPage() {
  const [result, user] = await Promise.all([loadIngredients(), getCurrentUserServer()]);

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Insumos"
        description="Materias primas que compras a proveedores. Define unidad de compra, unidad de receta y factor de conversión."
        icon={<BrandIcon name="flame" className="h-6 w-6" />}
        actions={
          <Link href="/ingredients/new">
            <Button>Nuevo insumo</Button>
          </Link>
        }
      />

      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <IngredientsList ingredients={result} userRole={user?.role} />
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
