import Link from 'next/link';
import { Button, Chip, Container, PageHeader } from '@pos-tercos/ui';
import { Receipt } from 'lucide-react';
import { InvoicesTable } from '../../../features/invoices';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { Invoice } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

async function loadInvoices(status?: string): Promise<Invoice[] | { error: string }> {
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return await serverFetchJson<Invoice[]>(`/invoices${qs}`);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'PENDING_REVIEW', label: 'Pendientes' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
];

export default async function InvoicesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadInvoices(sp.status);

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Facturas"
        description="Histórico de facturas de proveedor procesadas con IA. Sube una foto y la IA extrae los ítems para que los revises antes de confirmar."
        icon={<Receipt className="h-6 w-6" strokeWidth={1.75} />}
        actions={
          <Link href="/invoices/new">
            <Button>Nueva factura</Button>
          </Link>
        }
      />

      <Container size="7xl" padY="md">
        <nav className="mb-5 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => {
            const active = (sp.status ?? '') === f.value;
            return (
              <Link key={f.value} href={f.value ? `/invoices?status=${f.value}` : '/invoices'}>
                <Chip selected={active} type="button">
                  {f.label}
                </Chip>
              </Link>
            );
          })}
        </nav>

        {Array.isArray(result) ? (
          <InvoicesTable rows={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar las facturas. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
