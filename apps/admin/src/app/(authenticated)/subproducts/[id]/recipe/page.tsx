import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <Link href={`/subproducts/${id}`} className="text-sm text-blue-600 hover:underline">
        ← Volver a editar subproducto
      </Link>
      <RecipeEditor
        parentType="subproduct"
        parentId={id}
        parentName={subproduct.name}
        initialRecipe={recipe}
        ingredients={ingredients}
        subproducts={subproducts}
      />
    </div>
  );
}
