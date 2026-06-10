import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
import { ProductRecipeTabs, RecipeEditor } from '../../../../../features/recipes';
import { ApiError, serverFetchJson } from '../../../../../lib/api-server';
import { requireRole } from '../../../../../lib/guards';
import type {
  Ingredient,
  Product,
  ProductSize,
  RecipeResponse,
  Subproduct,
} from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductRecipePage({ params }: PageProps) {
  // Solo Dueño puede modificar recetas — el editor de receta es Dueño-only.
  await requireRole(['DUENO']);
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

  // Si el producto tiene variantes, cargamos la receta de cada una para las pestañas.
  const sizes: ProductSize[] = (product.sizes ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const variants = await Promise.all(
    sizes.map(async (size) => ({
      size,
      recipe: await serverFetchJson<RecipeResponse>(
        `/products/${id}/sizes/${size.id}/recipe`,
      ),
    })),
  );

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
        {variants.length > 0 ? (
          <ProductRecipeTabs
            productId={id}
            productName={product.name}
            ingredients={ingredients}
            subproducts={subproducts}
            baseRecipe={recipe}
            variants={variants}
          />
        ) : (
          <RecipeEditor
            parentType="product"
            parentId={id}
            parentName={product.name}
            initialRecipe={recipe}
            ingredients={ingredients}
            subproducts={subproducts}
            showExpandedCost
          />
        )}
      </Container>
    </>
  );
}
