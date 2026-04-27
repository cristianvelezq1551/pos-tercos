import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <Link href={`/products/${id}`} className="text-sm text-blue-600 hover:underline">
        ← Volver a editar producto
      </Link>
      <RecipeEditor
        parentType="product"
        parentId={id}
        parentName={product.name}
        initialRecipe={recipe}
        ingredients={ingredients}
        subproducts={subproducts}
        showExpandedCost
      />
    </div>
  );
}
