import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdjustStockForm } from '../../../../../../features/inventory';
import { ApiError, serverFetchJson } from '../../../../../../lib/api-server';
import { StockableTypeEnum, type Stockable } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ entityType: string; id: string }>;
}

export default async function AdjustStockPage({ params }: PageProps) {
  const { entityType, id } = await params;

  const parsed = StockableTypeEnum.safeParse(entityType.toUpperCase());
  if (!parsed.success) notFound();

  let stockable: Stockable;
  try {
    stockable = await serverFetchJson<Stockable>(
      `/inventory/stock/${parsed.data.toLowerCase()}/${id}`,
    );
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
        <AdjustStockForm stockable={stockable} />
      </div>
    </div>
  );
}
