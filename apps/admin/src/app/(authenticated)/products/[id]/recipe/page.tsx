import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { RecipeEditor } from '../../../../../features/recipes';
import { ApiError, serverFetchJson } from '../../../../../lib/api-server';
import type {
  Ingredient,
  Product,
  RecipeResponse,
  Subproduct,
} from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductRecipePage({ params }: PageProps) {
  const { id } = await params;

  let product: Product;
  let recipe: RecipeResponse;
  let ingredients: Ingredient[];
  let subproducts: Subproduct[];

  try {
    [product, recipe, ingredients, subproducts] = await Promise.all([
      serverFetchJson<Product>(`/products/${id}`),
      serverFetchJson<RecipeResponse>(`/products/${id}/recipe`),
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
        title={`Receta de ${product.name}`}
        description="Define los componentes de la receta. El sistema calcula el costo desde el último precio registrado de cada insumo."
        breadcrumbs={[
          { label: 'Productos', href: '/products' },
          { label: product.name, href: `/products/${id}` },
          { label: 'Receta' },
        ]}
      />
      <Container size="6xl" padY="md">
        <RecipeEditor
          parentType="product"
          parentId={id}
          parentName={product.name}
          initialRecipe={recipe}
          ingredients={ingredients}
          subproducts={subproducts}
          showExpandedCost
        />
      </Container>
    </>
  );
}
