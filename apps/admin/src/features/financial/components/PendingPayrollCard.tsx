import type { FinancePendingPayroll } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { AgingBadge } from './AgingBadge';
import { EmptyHint } from './EmptyHint';

/** "2026-07-09" → "9 jul" (local, sin año — va inline en el sublabel). */
function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(
    new Date(y, m - 1, d),
  );
}

/** Semana en curso: devengado a la fecha, todavía no es deuda vencida. */
function InProgressBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-success-border bg-success-bg/40 px-1.5 py-px text-[10px] font-semibold text-success"
      title="Semana en curso: lo devengado hasta hoy, no la semana completa"
    >
      En curso
    </span>
  );
}

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
                href={`/workers/semana?week=${r.periodStart}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.userName}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs text-muted-foreground">
                      {r.periodLabel}
                      {r.inProgress && r.accruedThrough
                        ? ` · devengado al ${shortDay(r.accruedThrough)}`
                        : null}
                    </p>
                    {r.inProgress ? <InProgressBadge /> : <AgingBadge since={r.periodStart} />}
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
