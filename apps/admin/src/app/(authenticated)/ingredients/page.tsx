import Link from 'next/link';
import { Button } from '@pos-tercos/ui';
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insumos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Materias primas que comprás a proveedores. Definí unidad de compra, unidad de receta y
            factor de conversión.
          </p>
        </div>
        <Link href="/ingredients/new">
          <Button size="sm">Nuevo insumo</Button>
        </Link>
      </div>

      {Array.isArray(result) ? (
        <IngredientsTable ingredients={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los insumos. {result.error}
        </p>
      )}
    </div>
  );
}
