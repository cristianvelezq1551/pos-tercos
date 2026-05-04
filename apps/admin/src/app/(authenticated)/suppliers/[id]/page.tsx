import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  SupplierForm,
  SupplierProductsTable,
} from '../../../../features/suppliers';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Invoice, Supplier, SupplierProduct } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL = {
  PENDING_REVIEW: 'Pendiente',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
} as const;

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

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

  // FASE 4 ajustes 2.7: cargar productos comprados + facturas en paralelo.
  // Si alguno falla, lo tratamos como vacío (no rompe el form principal).
  const [products, invoices] = await Promise.all([
    serverFetchJson<SupplierProduct[]>(`/suppliers/${id}/products`).catch(() => []),
    serverFetchJson<Invoice[]>(`/invoices?supplier_id=${id}&limit=10`).catch(() => []),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/suppliers" className="text-sm text-blue-600 hover:underline">
          ← Volver a proveedores
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{supplier.name}</h1>
        <p className="mt-1 text-sm text-gray-500">NIT {supplier.nit}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Datos del proveedor
        </h2>
        <div className="max-w-2xl">
          <SupplierForm initial={supplier} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Productos comprados <span className="text-gray-400">({products.length})</span>
        </h2>
        <SupplierProductsTable items={products} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Últimas facturas <span className="text-gray-400">({invoices.length})</span>
        </h2>
        {invoices.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Aún no hay facturas registradas para este proveedor.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Fecha
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Número
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Estado
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Total
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(inv.createdAt).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {inv.invoiceNumber ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{STATUS_LABEL[inv.status]}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {inv.total !== null ? COP.format(inv.total) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
