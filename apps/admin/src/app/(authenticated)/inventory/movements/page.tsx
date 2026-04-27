import Link from 'next/link';
import { MovementsTable } from '../../../../features/inventory';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Ingredient, InventoryMovement } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ ingredient_id?: string; type?: string }>;
}

async function loadData(filters: { ingredientId?: string; type?: string }): Promise<
  { movements: InventoryMovement[]; ingredients: Ingredient[]; ingredientName?: string } | { error: string }
> {
  try {
    const params = new URLSearchParams();
    if (filters.ingredientId) params.set('ingredient_id', filters.ingredientId);
    if (filters.type) params.set('type', filters.type);
    params.set('limit', '200');

    const [movements, ingredients] = await Promise.all([
      serverFetchJson<InventoryMovement[]>(`/inventory/movements?${params.toString()}`),
      serverFetchJson<Ingredient[]>('/ingredients'),
    ]);

    const ingredientName = filters.ingredientId
      ? ingredients.find((i) => i.id === filters.ingredientId)?.name
      : undefined;

    return { movements, ingredients, ingredientName };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'PURCHASE', label: 'Compra' },
  { value: 'SALE', label: 'Venta' },
  { value: 'MANUAL_ADJUSTMENT', label: 'Ajuste manual' },
  { value: 'WASTE', label: 'Merma' },
  { value: 'INITIAL', label: 'Stock inicial' },
];

export default async function MovementsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadData({ ingredientId: sp.ingredient_id, type: sp.type });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-blue-600 hover:underline">
          ← Volver a inventario
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Movimientos</h1>
        <p className="mt-1 text-sm text-gray-600">
          Histórico inmutable de cada cambio de stock. Insertar-only por diseño: las correcciones
          van como movimientos compensatorios.
        </p>
      </div>

      {!('error' in result) && (
        <FiltersBar
          ingredients={result.ingredients}
          ingredientId={sp.ingredient_id ?? ''}
          type={sp.type ?? ''}
          ingredientName={result.ingredientName}
        />
      )}

      {Array.isArray((result as { movements?: InventoryMovement[] }).movements) ? (
        <MovementsTable rows={(result as { movements: InventoryMovement[] }).movements} />
      ) : 'error' in result ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los movimientos. {result.error}
        </p>
      ) : null}
    </div>
  );
}

function FiltersBar({
  ingredients,
  ingredientId,
  type,
  ingredientName,
}: {
  ingredients: Ingredient[];
  ingredientId: string;
  type: string;
  ingredientName?: string;
}) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="space-y-1">
        <label htmlFor="ingredient_id" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Insumo
        </label>
        <select
          id="ingredient_id"
          name="ingredient_id"
          defaultValue={ingredientId}
          className="flex h-9 w-56 rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <option value="">Todos los insumos</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="type" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Tipo
        </label>
        <select
          id="type"
          name="type"
          defaultValue={type}
          className="flex h-9 w-44 rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        Aplicar
      </button>
      {(ingredientId || type) && (
        <Link
          href="/inventory/movements"
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Limpiar filtros
        </Link>
      )}
      {ingredientName && (
        <p className="ml-auto text-xs text-gray-500">
          Filtrando por <span className="font-medium text-gray-900">{ingredientName}</span>
        </p>
      )}
    </form>
  );
}
