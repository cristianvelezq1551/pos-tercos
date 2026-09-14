'use client';

import type { FinancePendingFixedCost, FixedCost } from '@pos-tercos/types';
import { Badge, Button, Money, cn } from '@pos-tercos/ui';
import { AlertTriangle, Receipt, Repeat } from 'lucide-react';
import { coverage, monthsOverdue, overdueTone, periodRange } from '../lib/vencimientos';

/** Chip de tipo: la misma dupla de iconos que separa las dos tablas de arriba. */
function TipoBadge({ frequency }: { frequency: FixedCost['frequency'] }) {
  return (
    <Badge tone="neutral" size="sm" className="shrink-0 font-normal">
      {frequency === 'ONE_TIME' ? (
        <>
          <Receipt className="h-3 w-3" strokeWidth={2} /> Único
        </>
      ) : (
        <>
          <Repeat className="h-3 w-3" strokeWidth={2} /> Recurrente
        </>
      )}
    </Badge>
  );
}

/** Un período sin pagar. Vencido = de un mes anterior al que corre. */
function PeriodRow({
  cost,
  period,
  nowYm,
  onPay,
}: {
  cost: FixedCost;
  period: FinancePendingFixedCost;
  nowYm: number | null;
  onPay: (period: FinancePendingFixedCost) => void;
}) {
  const m = monthsOverdue(nowYm, period.periodYear, period.periodMonth);
  const isOverdue = m > 0;
  const tone = overdueTone(m);
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
        isOverdue ? tone.row : 'border-transparent bg-muted/30',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isOverdue ? (
            <AlertTriangle
              className={cn('h-3.5 w-3.5 shrink-0', m >= 2 ? 'text-destructive' : 'text-warning')}
            />
          ) : null}
          <p className="truncate text-sm font-medium text-foreground">
            {period.periodLabel.replace(`${cost.name} · `, '')}
          </p>
          {isOverdue ? (
            <Badge size="sm" className={cn('shrink-0 border', tone.badge)}>
              Vencido · hace {m} mes{m > 1 ? 'es' : ''}
            </Badge>
          ) : (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Mes en curso
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {periodRange(cost.frequency, period.periodYear, period.periodMonth, cost.startedAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Money amount={period.amount} weight="semibold" />
        <Button variant="default" onClick={() => onPay(period)} className="px-6">
          Pagar
        </Button>
      </div>
    </li>
  );
}

/** Tarjeta de un costo con todos sus períodos sin pagar. */
export function PendingCostCard({
  cost,
  periods,
  nowYm,
  onPay,
}: {
  cost: FixedCost;
  periods: FinancePendingFixedCost[];
  nowYm: number | null;
  onPay: (period: FinancePendingFixedCost) => void;
}) {
  const overdueCount = periods.filter(
    (p) => monthsOverdue(nowYm, p.periodYear, p.periodMonth) > 0,
  ).length;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-4',
        overdueCount > 0 ? 'border-warning-border/60' : 'border-border',
      )}
    >
      <header className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
            <span className="truncate">{cost.name}</span>
            <TipoBadge frequency={cost.frequency} />
          </h3>
          {overdueCount > 0 ? (
            <span className="shrink-0 text-xs font-semibold text-warning">
              {overdueCount} vencido{overdueCount > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">
              {periods.length} pendiente{periods.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {cost.category} · Vigente {coverage(cost.startedAt, cost.endedAt)}
        </p>
      </header>
      <ul className="space-y-1.5">
        {periods.map((p) => (
          <PeriodRow
            key={`${p.periodYear}|${p.periodMonth}`}
            cost={cost}
            period={p}
            nowYm={nowYm}
            onPay={onPay}
          />
        ))}
      </ul>
    </div>
  );
}
