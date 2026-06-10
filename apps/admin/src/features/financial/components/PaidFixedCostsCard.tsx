import type { FinancePaidFixedCost } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
import { Eye } from 'lucide-react';
import { fixedCostProofUrl } from '../../fixed-costs';
import { EmptyHint } from './EmptyHint';
import { formatShortDate } from './format-short-date';

export function PaidFixedCostsCard({ rows }: { rows: FinancePaidFixedCost[] }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Costos fijos pagados</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="Sin pagos de costos fijos registrados este mes." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.paymentId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.periodLabel.replace(`${r.name} · `, '')} · pagado {formatShortDate(r.paidAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Money amount={r.amount} weight="semibold" />
                {r.hasProof ? (
                  <a
                    href={fixedCostProofUrl(r.paymentId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ver comprobante"
                    className="inline-flex h-6 items-center rounded-md border border-border px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
