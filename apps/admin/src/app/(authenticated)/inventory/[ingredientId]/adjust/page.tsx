import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdjustStockForm } from '../../../../../features/inventory';
import { ApiError, serverFetchJson } from '../../../../../lib/api-server';
import type { IngredientWithStock } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ ingredientId: string }>;
}

export default async function AdjustStockPage({ params }: PageProps) {
  const { ingredientId } = await params;

  let ingredient: IngredientWithStock;
  try {
    ingredient = await serverFetchJson<IngredientWithStock>(`/inventory/stock/${ingredientId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-blue-600 hover:underline">
          ← Volver a inventario
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Ajustar stock</h1>
        <p className="mt-1 text-sm text-gray-600">
          Registrar un movimiento de inventario manual. Esta acción queda en el log de auditoría.
        </p>
      </div>
      <div className="max-w-2xl">
        <AdjustStockForm ingredient={ingredient} />
      </div>
    </div>
  );
}
