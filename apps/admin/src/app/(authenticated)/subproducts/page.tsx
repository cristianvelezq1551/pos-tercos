import Link from 'next/link';
import { Button } from '@pos-tercos/ui';
import { SubproductsTable } from '../../../features/subproducts';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Subproduct } from '@pos-tercos/types';

async function loadSubproducts(): Promise<Subproduct[] | { error: string }> {
  try {
    return await serverFetchJson<Subproduct[]>('/subproducts');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function SubproductsPage() {
  const result = await loadSubproducts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subproductos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Intermedios cocinados que se usan en la receta de productos vendibles. Definí el yield
            (unidades por batch) para que el sistema calcule consumo proporcional.
          </p>
        </div>
        <Link href="/subproducts/new">
          <Button size="sm">Nuevo subproducto</Button>
        </Link>
      </div>

      {Array.isArray(result) ? (
        <SubproductsTable subproducts={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los subproductos. {result.error}
        </p>
      )}
    </div>
  );
}
