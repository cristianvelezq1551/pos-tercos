import type { Invoice, InvoiceStatus } from '@pos-tercos/types';
import {
  Button,
  DataTable,
  EmptyState,
  Money,
  StatusBadge,
  formatDate,
  type DataTableColumn,
  type StatusMapping,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';

interface InvoicesTableProps {
  rows: Invoice[];
}

const STATUS_MAPPING: StatusMapping<InvoiceStatus> = {
  PENDING_REVIEW: { label: 'Pendiente revisión', tone: 'warning', pulse: true },
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
};

export function InvoicesTable({ rows }: InvoicesTableProps) {
  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: (inv) => (
        <time className="tabular text-xs text-muted-foreground" dateTime={inv.createdAt}>
          {formatDate(inv.createdAt, 'datetime')}
        </time>
      ),
    },
    {
      key: 'supplier',
      header: 'Proveedor',
      cell: (inv) => (
        <span className="font-medium text-foreground">
          {inv.supplierName ?? <span className="text-ink-400">— sin proveedor —</span>}
        </span>
      ),
    },
    {
      key: 'number',
      header: 'Número',
      hideOnMobile: true,
      cell: (inv) => inv.invoiceNumber ?? <span className="text-ink-400">—</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      numeric: true,
      cell: (inv) =>
        inv.total !== null ? (
          <Money amount={inv.total} weight="semibold" />
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (inv) => <StatusBadge status={inv.status} mapping={STATUS_MAPPING} size="sm" />,
    },
    {
      key: 'uploadedBy',
      header: 'Subido por',
      hideOnMobile: true,
      cell: (inv) => <span className="text-ink-600">{inv.uploadedByName ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (inv) => (
        <Link
          href={`/invoices/${inv.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver detalle
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(inv) => inv.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-cart" />}
          title="Aún no hay facturas cargadas"
          description="Sube una foto de factura y la IA extrae los ítems para que los revises."
          action={
            <Link href="/invoices/new">
              <Button>Subir primera factura</Button>
            </Link>
          }
        />
      }
    />
  );
}
