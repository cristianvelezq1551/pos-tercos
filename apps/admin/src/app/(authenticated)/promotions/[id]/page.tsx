import { notFound } from 'next/navigation';
import { PromotionDetail } from '../../../../features/promotions';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Product, Promotion } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PromotionDetailPage({ params }: PageProps) {
  const { id } = await params;

  let promotion: Promotion;
  try {
    promotion = await serverFetchJson<Promotion>(`/promotions/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let products: Product[] = [];
  try {
    products = await serverFetchJson<Product[]>('/products');
  } catch {
    products = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{promotion.name}</h1>
        <p className="mt-1 text-sm text-gray-600">Detalle de la promoción.</p>
      </div>
      <PromotionDetail promotion={promotion} products={products} />
    </div>
  );
}
