import Link from 'next/link';
import { Button, Container, FormField, PageHeader, Select } from '@pos-tercos/ui';
import { PackageOpen } from 'lucide-react';
import { MovementsList } from '../../../../features/inventory';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import type {
  Ingredient,
  InventoryMovement,
  Product,
  Subproduct,
} from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{
    ingredient_id?: string;
    product_id?: string;
    subproduct_id?: string;
    type?: string;
  }>;
}

interface MovementsData {
  movements: InventoryMovement[];
  ingredients: Ingredient[];
  products: Product[];
  subproducts: Subproduct[];
  filterName?: string;
}

async function loadData(filters: {
  ingredientId?: string;
  productId?: string;
  subproductId?: string;
  type?: string;
}): Promise<MovementsData | { error: string }> {
  try {
    const params = new URLSearchParams();
    if (filters.ingredientId) params.set('ingredient_id', filters.ingredientId);
    if (filters.productId) {
      params.set('entity_type', 'PRODUCT');
      params.set('product_id', filters.productId);
    }
    if (filters.subproductId) {
      params.set('entity_type', 'SUBPRODUCT');
      params.set('subproduct_id', filters.subproductId);
    }
    if (filters.type) params.set('type', filters.type);
    params.set('limit', '200');

    const [movements, ingredients, allProducts, subproducts] = await Promise.all([
      serverFetchJson<InventoryMovement[]>(`/inventory/movements?${params.toString()}`),
      serverFetchJson<Ingredient[]>('/ingredients'),
      serverFetchJson<Product[]>('/products?only_active=true'),
      serverFetchJson<Subproduct[]>('/subproducts'),
    ]);

    // Solo los productos de reventa directa generan movimientos de stock.
    const products = allProducts.filter((p) => p.directResale);

    let filterName: string | undefined;
    if (filters.ingredientId) {
      filterName = ingredients.find((i) => i.id === filters.ingredientId)?.name;
    } else if (filters.productId) {
      filterName = products.find((p) => p.id === filters.productId)?.name;
    } else if (filters.subproductId) {
      filterName = subproducts.find((s) => s.id === filters.subproductId)?.name;
    }

    return { movements, ingredients, products, subproducts, filterName };
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'PURCHASE', label: 'Compra' },
  { value: 'SALE', label: 'Venta' },
  { value: 'PRODUCTION', label: 'Producción' },
  { value: 'MANUAL_ADJUSTMENT', label: 'Ajuste manual' },
  { value: 'WASTE', label: 'Merma' },
  { value: 'INITIAL', label: 'Stock inicial' },
];

export default async function MovementsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadData({
    ingredientId: sp.ingredient_id,
    productId: sp.product_id,
    subproductId: sp.subproduct_id,
    type: sp.type,
  });

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Movimientos"
        description="Histórico inmutable de cada cambio de stock. Las correcciones van como movimientos compensatorios."
        icon={<PackageOpen className="h-6 w-6" strokeWidth={1.75} />}
        breadcrumbs={[{ label: 'Existencias', href: '/inventory' }, { label: 'Movimientos' }]}
      />
      <Container size="7xl" padY="md">
        {!('error' in result) ? (
          <FiltersBar
            ingredients={result.ingredients}
            products={result.products}
            subproducts={result.subproducts}
            ingredientId={sp.ingredient_id ?? ''}
            productId={sp.product_id ?? ''}
            subproductId={sp.subproduct_id ?? ''}
            type={sp.type ?? ''}
            filterName={result.filterName}
          />
        ) : null}

        <div className="mt-5">
          {!('error' in result) ? (
            <MovementsList rows={result.movements} />
          ) : (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudieron cargar los movimientos. {result.error}
            </p>
          )}
        </div>
      </Container>
    </>
  );
}

function FiltersBar({
  ingredients,
  products,
  subproducts,
  ingredientId,
  productId,
  subproductId,
  type,
  filterName,
}: {
  ingredients: Ingredient[];
  products: Product[];
  subproducts: Subproduct[];
  ingredientId: string;
  productId: string;
  subproductId: string;
  type: string;
  filterName?: string;
}) {
  // En teléfono cada filtro va a lo ancho: dimensionados por su contenido
  // quedaban de anchos distintos, uno debajo del otro, como una escalera.
  return (
    <form className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:flex sm:flex-wrap sm:items-end [&_select]:w-full sm:[&_select]:w-auto">
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
      <FormField label="Subproducto">
        <Select id="subproduct_id" name="subproduct_id" defaultValue={subproductId}>
          <option value="">Todos los subproductos</option>
          {subproducts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Producto (reventa)">
        <Select id="product_id" name="product_id" defaultValue={productId}>
          <option value="">Todos los productos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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
      <Button type="submit" className="max-sm:w-full">
        Aplicar
      </Button>
      {ingredientId || productId || subproductId || type ? (
        <Link
          href="/inventory/movements"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Limpiar filtros
        </Link>
      ) : null}
      {filterName ? (
        <p className="ml-auto text-xs text-muted-foreground">
          Filtrando por <span className="font-semibold text-foreground">{filterName}</span>
        </p>
      ) : null}
    </form>
  );
}
