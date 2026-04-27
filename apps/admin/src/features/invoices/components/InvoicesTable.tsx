import type { Invoice, InvoiceStatus } from '@pos-tercos/types';
import Link from 'next/link';

interface InvoicesTableProps {
  rows: Invoice[];
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING_REVIEW: 'Pendiente revisión',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
};

const STATUS_TONE: Record<InvoiceStatus, 'amber' | 'green' | 'red'> = {
  PENDING_REVIEW: 'amber',
  CONFIRMED: 'green',
  REJECTED: 'red',
};

export function InvoicesTable({ rows }: InvoicesTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">Aún no hay facturas cargadas.</p>
        <p className="mt-1 text-sm text-gray-500">
          Subí una foto de factura y la IA extrae los ítems para que los revises.
        </p>
        <Link
          href="/invoices/new"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Subir primera factura
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Fecha</Th>
            <Th>Proveedor</Th>
            <Th>Número</Th>
            <Th align="right">Total</Th>
            <Th>Estado</Th>
            <Th>Subido por</Th>
            <Th align="right">Acción</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((inv) => (
            <tr key={inv.id} className="transition-colors hover:bg-gray-50">
              <Td>
                <time className="font-mono text-xs text-gray-600" dateTime={inv.createdAt}>
                  {formatDate(inv.createdAt)}
                </time>
              </Td>
              <Td>
                <span className="font-medium text-gray-900">
                  {inv.supplierName ?? <span className="text-gray-400">— sin proveedor —</span>}
                </span>
              </Td>
              <Td>
                {inv.invoiceNumber ?? <span className="text-gray-400">—</span>}
              </Td>
              <Td align="right" mono>
                {inv.total !== null ? formatCurrency(inv.total) : '—'}
              </Td>
              <Td>
                <Badge tone={STATUS_TONE[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
              </Td>
              <Td>
                <span className="text-gray-600">{inv.uploadedByName ?? '—'}</span>
              </Td>
              <Td align="right">
                <Link
                  href={`/invoices/${inv.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Ver detalle
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'amber' | 'green' | 'red' }) {
  const map = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/30',
    green: 'bg-green-50 text-green-700 ring-green-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(n: number): string {
  return n.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}
