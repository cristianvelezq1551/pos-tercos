import Link from 'next/link';
import { Button } from '@pos-tercos/ui';
import { PromotionsTable } from '../../../features/promotions';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Promotion } from '@pos-tercos/types';

async function loadPromotions(): Promise<Promotion[] | { error: string }> {
  try {
    return await serverFetchJson<Promotion[]>('/promotions');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function PromotionsPage() {
  const result = await loadPromotions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promociones</h1>
          <p className="mt-1 text-sm text-gray-600">
            Descuentos automáticos que se aplican al cobrar la venta. 4 tipos:
            descuento %, descuento fijo, BOGO y combo.
          </p>
        </div>
        <Link href="/promotions/new">
          <Button size="sm">Nueva promoción</Button>
        </Link>
      </div>

      {Array.isArray(result) ? (
        <PromotionsTable promotions={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las promociones. {result.error}
        </p>
      )}
    </div>
  );
}
