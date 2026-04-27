import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ingredients" className="text-sm text-blue-600 hover:underline">
          ← Volver a insumos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar: {ingredient.name}</h1>
      </div>
      <div className="max-w-2xl">
        <IngredientForm initial={ingredient} />
      </div>
    </div>
  );
}
