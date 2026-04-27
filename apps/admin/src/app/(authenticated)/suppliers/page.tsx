import Link from 'next/link';
import { Button } from '@pos-tercos/ui';
import { SuppliersTable } from '../../../features/suppliers';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Supplier } from '@pos-tercos/types';

async function loadSuppliers(): Promise<Supplier[] | { error: string }> {
  try {
    return await serverFetchJson<Supplier[]>('/suppliers');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function SuppliersPage() {
  const result = await loadSuppliers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="mt-1 text-sm text-gray-600">
            Distribuidores que te facturan insumos o productos. Se crean automáticamente al
            confirmar facturas, pero podés editarlos o cargarlos manualmente.
          </p>
        </div>
        <Link href="/suppliers/new">
          <Button size="sm">Nuevo proveedor</Button>
        </Link>
      </div>

      {Array.isArray(result) ? (
        <SuppliersTable suppliers={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los proveedores. {result.error}
        </p>
      )}
    </div>
  );
}
