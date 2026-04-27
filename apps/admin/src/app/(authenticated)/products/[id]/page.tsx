import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductForm } from '../../../../features/products';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Product } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;

  let product: Product;
  try {
    product = await serverFetchJson<Product>(`/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/products" className="text-sm text-blue-600 hover:underline">
          ← Volver a productos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar: {product.name}</h1>
      </div>
      <div className="max-w-2xl">
        <ProductForm initial={product} />
      </div>
    </div>
  );
}
