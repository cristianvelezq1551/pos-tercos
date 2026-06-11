import { cn } from '@pos-tercos/ui';

const DAY_MS = 86_400_000;
/** Cerrado hace más de esto → destructive. */
const OVERDUE_DAYS = 30;
/** Hasta esto se considera reciente → sin badge (neutral). */
const RECENT_DAYS = 7;

/** Último día del mes del período — para pendientes que solo traen year/month. */
export function endOfPeriodMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

/**
 * Badge tonal de antigüedad para pendientes del cockpit:
 * >30 días → destructive · 8–30 días → warning · ≤7 días o sin fecha → nada.
 */
export function AgingBadge({ since }: { since: Date | string | null }) {
  if (!since) return null;
  const date = typeof since === 'string' ? new Date(since) : since;
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days <= RECENT_DAYS) return null;
  const overdue = days > OVERDUE_DAYS;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-semibold tabular-nums',
        overdue
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-warning-border bg-warning-bg/40 text-warning',
      )}
      title={overdue ? 'Pendiente hace más de 30 días' : 'Pendiente hace más de una semana'}
    >
      hace {days} d
    </span>
  );
}
