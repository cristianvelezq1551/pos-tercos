import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Container,
  DataTable,
  PageHeader,
  Section,
  formatCop,
  formatDate,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { SupplierForm, SupplierProductsTable } from '../../../../features/suppliers';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Invoice, Supplier, SupplierProduct } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL = {
  PENDING_REVIEW: 'Pendiente',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
  VOIDED: 'Anulada',
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
        breadcrumbs={[{ label: 'Proveedores', href: '/suppliers' }, { label: supplier.name }]}
      />
      <Container size="6xl" padY="md">
        <div className="space-y-8">
          <Section eyebrow="Datos" title="Información del proveedor" size="md">
            <SupplierForm initial={supplier} />
          </Section>

          <Section eyebrow="Histórico" title={`Productos comprados (${products.length})`} size="md">
            <SupplierProductsTable items={products} />
          </Section>

          <Section eyebrow="Facturación" title={`Últimas facturas (${invoices.length})`} size="md">
            {invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
                Aún no hay facturas registradas para este proveedor.
              </div>
            ) : (
              <SupplierInvoicesTable invoices={invoices} />
            )}
          </Section>
        </div>
      </Container>
    </>
  );
}

/** Las facturas del proveedor. En teléfono cada una es una tarjeta: cinco
 *  columnas no caben en 390 px y las últimas quedaban fuera de la pantalla. */
function SupplierInvoicesTable({ invoices }: { invoices: Invoice[] }) {
  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'date',
      header: 'Fecha',
      primary: true,
      cell: (inv) => (
        <span className="font-medium text-foreground">{formatDate(inv.createdAt, 'short')}</span>
      ),
    },
    {
      key: 'number',
      header: 'Número',
      cell: (inv) => inv.invoiceNumber ?? <span className="text-muted-foreground">—</span>,
    },
    { key: 'status', header: 'Estado', cell: (inv) => STATUS_LABEL[inv.status] },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      numeric: true,
      cell: (inv) => (inv.total !== null ? formatCop(inv.total) : '—'),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (inv) => (
        <Link
          href={`/invoices/${inv.id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Ver
        </Link>
      ),
    },
  ];

  return <DataTable rows={invoices} columns={columns} rowKey={(inv) => inv.id} />;
}
