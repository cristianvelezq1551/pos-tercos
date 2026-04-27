import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SubproductForm } from '../../../../features/subproducts';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Subproduct } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSubproductPage({ params }: PageProps) {
  const { id } = await params;

  let subproduct: Subproduct;
  try {
    subproduct = await serverFetchJson<Subproduct>(`/subproducts/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/subproducts" className="text-sm text-blue-600 hover:underline">
          ← Volver a subproductos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar: {subproduct.name}</h1>
      </div>
      <div className="max-w-2xl">
        <SubproductForm initial={subproduct} />
      </div>
    </div>
  );
}
