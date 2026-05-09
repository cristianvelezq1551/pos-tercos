import Link from 'next/link';
import { Button, Container, FormField, PageHeader, Select } from '@pos-tercos/ui';
import { PackageOpen } from 'lucide-react';
import { MovementsTable } from '../../../../features/inventory';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Ingredient, InventoryMovement } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ ingredient_id?: string; type?: string }>;
}

async function loadData(filters: {
  ingredientId?: string;
  type?: string;
}): Promise<
  | { movements: InventoryMovement[]; ingredients: Ingredient[]; ingredientName?: string }
  | { error: string }
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
    if (err instanceof ApiError) return { error: `API ${err.status}` };
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
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Movimientos"
        description="Histórico inmutable de cada cambio de stock. Las correcciones van como movimientos compensatorios."
        icon={<PackageOpen className="h-6 w-6" strokeWidth={1.75} />}
        breadcrumbs={[{ label: 'Stock', href: '/inventory' }, { label: 'Movimientos' }]}
      />
      <Container size="7xl" padY="md">
        {!('error' in result) ? (
          <FiltersBar
            ingredients={result.ingredients}
            ingredientId={sp.ingredient_id ?? ''}
            type={sp.type ?? ''}
            ingredientName={result.ingredientName}
          />
        ) : null}

        <div className="mt-5">
          {Array.isArray((result as { movements?: InventoryMovement[] }).movements) ? (
            <MovementsTable rows={(result as { movements: InventoryMovement[] }).movements} />
          ) : 'error' in result ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudieron cargar los movimientos. {result.error}
            </p>
          ) : null}
        </div>
      </Container>
    </>
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
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <FormField label="Insumo">
        <Select id="ingredient_id" name="ingredient_id" defaultValue={ingredientId}>
          <option value="">Todos los insumos</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Tipo">
        <Select id="type" name="type" defaultValue={type}>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </FormField>
      <Button type="submit">Aplicar</Button>
      {ingredientId || type ? (
        <Link
          href="/inventory/movements"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Limpiar filtros
        </Link>
      ) : null}
      {ingredientName ? (
        <p className="ml-auto text-xs text-muted-foreground">
          Filtrando por{' '}
          <span className="font-semibold text-foreground">{ingredientName}</span>
        </p>
      ) : null}
    </form>
  );
}
