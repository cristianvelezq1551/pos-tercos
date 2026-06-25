import type { FinancePendingPayable } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
import Link from 'next/link';
import { EmptyHint } from './EmptyHint';

export function PendingPayablesCard({ rows }: { rows: FinancePendingPayable[] }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Compromisos por pagar</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="Sin compromisos pendientes." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="py-2 first:pt-0 last:pb-0">
              <Link
                href="/finanzas/compromisos"
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.beneficiary}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                </div>
                <Money amount={r.amount} weight="semibold" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
