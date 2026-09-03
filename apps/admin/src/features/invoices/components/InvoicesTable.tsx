import type { Invoice, InvoiceStatus } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  DateTimeCell,
  EmptyState,
  Money,
  StatusBadge,
  type DataTableColumn,
  type StatusMapping,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface InvoicesTableProps {
  rows: Invoice[];
}

const STATUS_MAPPING: StatusMapping<InvoiceStatus> = {
  PENDING_REVIEW: { label: 'Pendiente revisión', tone: 'warning', pulse: true },
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
  VOIDED: { label: 'Anulada', tone: 'danger' },
};

export function InvoicesTable({ rows }: InvoicesTableProps) {
  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: (inv) => (
        <DateTimeCell value={inv.createdAt} />
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
      key: 'freight',
      header: 'Domicilio',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      // "—" y no "$0": la mayoría de las facturas no cobra domicilio, y una
      // columna llena de ceros esconde justo las que sí.
      cell: (inv) =>
        inv.freightAmount > 0 ? (
          <Money amount={inv.freightAmount} weight="semibold" />
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
      key: 'payment',
      header: 'Pago',
      cell: (inv) => {
        if (inv.status !== 'CONFIRMED') {
          return <span className="text-ink-400">—</span>;
        }
        if (inv.paymentStatus === 'PAID') {
          return (
            <Badge tone="success" size="sm">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Pagada
            </Badge>
          );
        }
        return <Badge tone="warning" size="sm">Por pagar</Badge>;
      },
    },
    {
      key: 'uploadedBy',
      header: 'Subido por',
      hideOnMobile: true,
      cell: (inv) => <span className="text-muted-foreground">{inv.uploadedByName ?? '—'}</span>,
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
