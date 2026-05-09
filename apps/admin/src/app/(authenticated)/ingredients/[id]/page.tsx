import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { IngredientForm } from '../../../../features/ingredients';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Ingredient } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditIngredientPage({ params }: PageProps) {
  const { id } = await params;

  let ingredient: Ingredient;
  try {
    ingredient = await serverFetchJson<Ingredient>(`/ingredients/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={ingredient.name}
        description="Edita los datos del insumo. Los cambios afectan a todas las recetas que lo usan."
        breadcrumbs={[
          { label: 'Insumos', href: '/ingredients' },
          { label: ingredient.name },
        ]}
      />
      <Container size="4xl" padY="md">
        <IngredientForm initial={ingredient} />
      </Container>
    </>
  );
}
