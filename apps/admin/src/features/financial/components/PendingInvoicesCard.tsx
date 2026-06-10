import type { FinancePendingInvoice } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { EmptyHint } from './EmptyHint';
import { formatShortDate } from './format-short-date';

export function PendingInvoicesCard({ rows }: { rows: FinancePendingInvoice[] }) {
  const total = rows.reduce((a, r) => a + r.total, 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Facturas pendientes</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="No hay facturas de proveedores por pagar." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.invoiceId} className="py-2 first:pt-0 last:pb-0">
              <Link
                href={`/invoices/${r.invoiceId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.supplierName ?? 'Proveedor sin nombre'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.invoiceNumber ?? 'sin nº'}
                    {r.confirmedAt ? ` · ${formatShortDate(r.confirmedAt)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money amount={r.total} weight="semibold" />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
