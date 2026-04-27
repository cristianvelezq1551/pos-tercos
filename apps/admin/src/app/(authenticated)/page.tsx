import Link from 'next/link';
import { ApiError, serverFetchJson } from '../../lib/api-server';
import type { IngredientWithStock, Product, Subproduct } from '@pos-tercos/types';

interface DashboardCounts {
  ingredients: number;
  ingredientsLowStock: number;
  subproducts: number;
  products: number;
}

async function loadCounts(): Promise<DashboardCounts | null> {
  try {
    const [stocks, subproducts, products] = await Promise.all([
      serverFetchJson<IngredientWithStock[]>('/inventory/stock'),
      serverFetchJson<Subproduct[]>('/subproducts'),
      serverFetchJson<Product[]>('/products'),
    ]);
    return {
      ingredients: stocks.length,
      ingredientsLowStock: stocks.filter((s) => s.lowStock).length,
      subproducts: subproducts.length,
      products: products.length,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('[dashboard] api error', err.status, err.body);
    }
    return null;
  }
}

export default async function DashboardPage() {
  const counts = await loadCounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Resumen del catálogo y operación.</p>
      </div>

      {counts ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Insumos" value={counts.ingredients} href="/ingredients" />
          <StatCard label="Subproductos" value={counts.subproducts} href="/subproducts" />
          <StatCard label="Productos" value={counts.products} href="/products" />
          <StatCard
            label="Stock crítico"
            value={counts.ingredientsLowStock}
            tone={counts.ingredientsLowStock > 0 ? 'warning' : 'default'}
            href="/ingredients?filter=low-stock"
          />
        </div>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No se pudo cargar el resumen. Verificá que el API esté corriendo.
        </p>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Cómo arrancar
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>
            Cargá tus insumos en{' '}
            <Link href="/ingredients" className="text-blue-600 hover:underline">
              Insumos
            </Link>{' '}
            con sus unidades de compra y receta + threshold mínimo.
          </li>
          <li>Definí subproductos (intermedios cocinados) con su yield por batch.</li>
          <li>Creá productos vendibles y editá su receta para que el sistema calcule COGS.</li>
        </ol>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  tone = 'default',
}: {
  label: string;
  value: number;
  href: string;
  tone?: 'default' | 'warning';
}) {
  const valueClass =
    tone === 'warning' ? 'text-amber-600' : 'text-gray-900';
  return (
    <Link
      href={href}
      className="block rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${valueClass}`}>{value}</p>
    </Link>
  );
}
