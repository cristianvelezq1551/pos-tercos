import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SupplierForm } from '../../../../features/suppliers';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Supplier } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSupplierPage({ params }: PageProps) {
  const { id } = await params;

  let supplier: Supplier;
  try {
    supplier = await serverFetchJson<Supplier>(`/suppliers/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/suppliers" className="text-sm text-blue-600 hover:underline">
          ← Volver a proveedores
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar: {supplier.name}</h1>
      </div>
      <div className="max-w-2xl">
        <SupplierForm initial={supplier} />
      </div>
    </div>
  );
}
