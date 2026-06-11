import type { FinancePendingPayroll } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { AgingBadge } from './AgingBadge';
import { EmptyHint } from './EmptyHint';

export function PendingPayrollCard({ rows }: { rows: FinancePendingPayroll[] }) {
  const total = rows.reduce((a, r) => a + r.total, 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Nómina pendiente</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="No hay sub-pagos pendientes. Estás al día con la gente." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={`${r.userId}-${r.periodStart}`} className="py-2 first:pt-0 last:pb-0">
              <Link
                href={`/workers/${r.userId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.userName}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs text-muted-foreground">{r.periodLabel}</p>
                    <AgingBadge since={r.periodStart} />
                  </div>
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
