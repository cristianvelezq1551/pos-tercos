import type { FinancePaidPayroll } from '@pos-tercos/types';
import { Badge, Money } from '@pos-tercos/ui';
import Link from 'next/link';
import { EmptyHint } from './EmptyHint';
import { formatShortDate } from './format-short-date';

export function PaidPayrollCard({ rows }: { rows: FinancePaidPayroll[] }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Nómina pagada</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="Sin pagos de nómina registrados este mes." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.paymentId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <Link
                href={`/workers/${r.userId}`}
                className="min-w-0 hover:underline"
              >
                <p className="truncate text-sm font-medium text-foreground">{r.userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.periodLabel} · pagado {formatShortDate(r.paidAt)}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Money amount={r.amount} weight="semibold" />
                {r.hasProof ? <Badge tone="success" size="sm">Comprobante</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
