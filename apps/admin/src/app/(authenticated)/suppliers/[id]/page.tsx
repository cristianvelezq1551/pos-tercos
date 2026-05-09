import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container, PageHeader, Section, formatCop, formatDate } from '@pos-tercos/ui';
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

export default async function EditSupplierPage({ params }: PageProps) {
  const { id } = await params;

  let supplier: Supplier;
  try {
    supplier = await serverFetchJson<Supplier>(`/suppliers/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [products, invoices] = await Promise.all([
    serverFetchJson<SupplierProduct[]>(`/suppliers/${id}/products`).catch(() => []),
    serverFetchJson<Invoice[]>(`/invoices?supplier_id=${id}&limit=10`).catch(() => []),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title={supplier.name}
        description={`NIT ${supplier.nit}`}
        breadcrumbs={[
          { label: 'Proveedores', href: '/suppliers' },
          { label: supplier.name },
        ]}
      />
      <Container size="6xl" padY="md">
        <div className="space-y-8">
          <Section eyebrow="Datos" title="Información del proveedor" size="md">
            <SupplierForm initial={supplier} />
          </Section>

          <Section
            eyebrow="Histórico"
            title={`Productos comprados (${products.length})`}
            size="md"
          >
            <SupplierProductsTable items={products} />
          </Section>

          <Section
            eyebrow="Facturación"
            title={`Últimas facturas (${invoices.length})`}
            size="md"
          >
            {invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
                Aún no hay facturas registradas para este proveedor.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="caps px-4 py-2.5 text-left text-[0.6875rem] text-muted-foreground">
                        Fecha
                      </th>
                      <th className="caps px-4 py-2.5 text-left text-[0.6875rem] text-muted-foreground">
                        Número
                      </th>
                      <th className="caps px-4 py-2.5 text-left text-[0.6875rem] text-muted-foreground">
                        Estado
                      </th>
                      <th className="caps px-4 py-2.5 text-right text-[0.6875rem] text-muted-foreground">
                        Total
                      </th>
                      <th className="caps px-4 py-2.5 text-right text-[0.6875rem] text-muted-foreground">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3 text-foreground">
                          {formatDate(inv.createdAt, 'short')}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {inv.invoiceNumber ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-foreground">{STATUS_LABEL[inv.status]}</td>
                        <td className="px-4 py-3 text-right tabular text-foreground">
                          {inv.total !== null ? formatCop(inv.total) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="text-sm font-semibold text-primary hover:underline"
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
          </Section>
        </div>
      </Container>
    </>
  );
}
