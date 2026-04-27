import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { Invoice } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<Invoice['status'], string> = {
  PENDING_REVIEW: 'Pendiente revisión',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
};

const STATUS_TONE: Record<Invoice['status'], string> = {
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  CONFIRMED: 'bg-green-50 text-green-700 ring-green-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  let invoice: Invoice;
  try {
    invoice = await serverFetchJson<Invoice>(`/invoices/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-blue-600 hover:underline">
          ← Volver a facturas
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {invoice.supplierName ?? '— sin proveedor —'}
          </h1>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[invoice.status]}`}
          >
            {STATUS_LABEL[invoice.status]}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Número factura" value={invoice.invoiceNumber ?? '—'} />
        <Card
          label="Total"
          value={invoice.total !== null ? formatCurrency(invoice.total) : '—'}
          mono
        />
        <Card
          label="IVA"
          value={invoice.iva !== null ? formatCurrency(invoice.iva) : '—'}
          mono
        />
        <Card
          label="Modelo IA"
          value={invoice.aiModelUsed ?? '—'}
          mono
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Auditoría
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row k="Subido por" v={invoice.uploadedByName ?? '—'} />
          <Row k="Subido en" v={formatDate(invoice.createdAt)} />
          {invoice.confirmedAt && (
            <>
              <Row k="Confirmado por" v={invoice.confirmedByName ?? '—'} />
              <Row k="Confirmado en" v={formatDate(invoice.confirmedAt)} />
            </>
          )}
          {invoice.notes && <Row k="Notas" v={invoice.notes} />}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Ítems ({invoice.items?.length ?? 0})
        </h2>
        {invoice.items && invoice.items.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Insumo</Th>
                  <Th>Descripción</Th>
                  <Th align="right">Cantidad</Th>
                  <Th>Unidad</Th>
                  <Th align="right">Precio unit.</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <Td>
                      <span className="font-medium text-gray-900">
                        {item.ingredientName ?? <span className="text-gray-400">—</span>}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-gray-600">{item.descriptionRaw}</span>
                    </Td>
                    <Td align="right" mono>
                      {formatNumber(item.quantity)}
                    </Td>
                    <Td>{item.unit}</Td>
                    <Td align="right" mono>
                      {formatCurrency(item.unitPrice)}
                    </Td>
                    <Td align="right" mono>
                      {formatCurrency(item.total)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            La factura no tiene ítems registrados.
          </p>
        )}
      </section>

      {invoice.status === 'PENDING_REVIEW' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Esta factura quedó como draft tras subir la foto. Para finalizarla con sus ítems,{' '}
          <Link href="/invoices/new" className="font-medium underline">
            subila otra vez
          </Link>{' '}
          o usá el endpoint <code className="rounded bg-amber-100 px-1">/invoices/:id/confirm</code>{' '}
          via API. (Reanudar el modal desde una draft existente queda pendiente para una próxima
          iteración.)
        </p>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-base font-semibold text-gray-900 ${mono ? 'tabular-nums' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium text-gray-500">{k}:</dt>
      <dd className="text-gray-900">{v}</dd>
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

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

function formatCurrency(n: number): string {
  return n.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
