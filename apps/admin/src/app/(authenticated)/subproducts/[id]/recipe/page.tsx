import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { RecipeEditor } from '../../../../../features/recipes';
import { ApiError, serverFetchJson } from '../../../../../lib/api-server';
import type {
  Ingredient,
  RecipeResponse,
  Subproduct,
} from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SubproductRecipePage({ params }: PageProps) {
  const { id } = await params;

  let subproduct: Subproduct;
  let recipe: RecipeResponse;
  let ingredients: Ingredient[];
  let subproducts: Subproduct[];

  try {
    [subproduct, recipe, ingredients, subproducts] = await Promise.all([
      serverFetchJson<Subproduct>(`/subproducts/${id}`),
      serverFetchJson<RecipeResponse>(`/subproducts/${id}/recipe`),
      serverFetchJson<Ingredient[]>('/ingredients?only_active=true'),
      serverFetchJson<Subproduct[]>('/subproducts?only_active=true'),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={`Receta de ${subproduct.name}`}
        description="Componentes que se usan al preparar este subproducto."
        breadcrumbs={[
          { label: 'Subproductos', href: '/subproducts' },
          { label: subproduct.name, href: `/subproducts/${id}` },
          { label: 'Receta' },
        ]}
      />
      <Container size="6xl" padY="md">
        <RecipeEditor
          parentType="subproduct"
          parentId={id}
          parentName={subproduct.name}
          initialRecipe={recipe}
          ingredients={ingredients}
          subproducts={subproducts}
        />
      </Container>
    </>
  );
}
