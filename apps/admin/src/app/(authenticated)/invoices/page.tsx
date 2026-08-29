import Link from 'next/link';
import { Button, Chip, Container, PageHeader } from '@pos-tercos/ui';
import { Receipt } from 'lucide-react';
import { InvoiceDateFilter, InvoicesTable, PendingDraftsBanner } from '../../../features/invoices';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { Invoice } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}

async function loadInvoices(
  status?: string,
  from?: string,
  to?: string,
): Promise<Invoice[] | { error: string }> {
  try {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return await serverFetchJson<Invoice[]>(`/invoices${qs ? `?${qs}` : ''}`);
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
  // Los borradores se cuentan SIN filtro de fecha: uno de la semana pasada
  // sigue siendo mercancía que falta cargar, y el rango elegido lo escondería.
  const [result, drafts] = await Promise.all([
    loadInvoices(sp.status, sp.from, sp.to),
    loadInvoices('PENDING_REVIEW'),
  ]);
  const pendingDrafts = Array.isArray(drafts) ? drafts.length : 0;

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
        <nav className="mb-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => {
            const active = (sp.status ?? '') === f.value;
            // El rango de fechas se conserva al cambiar de pestaña: perderlo
            // obligaría a re-elegirlo cada vez que se pasa a "Confirmadas".
            const params = new URLSearchParams();
            if (f.value) params.set('status', f.value);
            if (sp.from) params.set('from', sp.from);
            if (sp.to) params.set('to', sp.to);
            const qs = params.toString();
            return (
              <Link key={f.value} href={qs ? `/invoices?${qs}` : '/invoices'}>
                <Chip selected={active} type="button">
                  {f.label}
                </Chip>
              </Link>
            );
          })}
        </nav>

        <div className="mb-5">
          <InvoiceDateFilter />
        </div>

        <PendingDraftsBanner count={pendingDrafts} />

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
