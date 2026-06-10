import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { Truck } from 'lucide-react';
import { SuppliersTable } from '../../../features/suppliers';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { Supplier } from '@pos-tercos/types';

async function loadSuppliers(): Promise<Supplier[] | { error: string }> {
  try {
    return await serverFetchJson<Supplier[]>('/suppliers');
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function SuppliersPage() {
  const result = await loadSuppliers();

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Proveedores"
        description="Distribuidores que te facturan insumos o productos. Se crean automáticamente al confirmar facturas, pero puedes editarlos o cargarlos manualmente."
        icon={<Truck className="h-6 w-6" strokeWidth={1.75} />}
        actions={
          <Link href="/suppliers/new">
            <Button>Nuevo proveedor</Button>
          </Link>
        }
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <SuppliersTable suppliers={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los proveedores. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
