import type { SuggestionsMetrics } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';

export function SuggestionsMetricsCard({
  metrics,
}: {
  metrics: SuggestionsMetrics;
}) {
  const total =
    metrics.byStatus.pending +
    metrics.byStatus.evaluated +
    metrics.byStatus.accepted +
    metrics.byStatus.rejected +
    metrics.byStatus.stale;
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sugerencias IA
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {total} sugerencia{total === 1 ? '' : 's'} en el período. {metrics.evaluatedCount}{' '}
          evaluada{metrics.evaluatedCount === 1 ? '' : 's'} con LLM.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Pill label="Pendientes" value={metrics.byStatus.pending} tone="amber" />
        <Pill label="Evaluadas" value={metrics.byStatus.evaluated} tone="purple" />
        <Pill label="Aceptadas" value={metrics.byStatus.accepted} tone="emerald" />
        <Pill label="Rechazadas" value={metrics.byStatus.rejected} tone="red" />
        <Pill label="Vencidas" value={metrics.byStatus.stale} tone="gray" />
      </div>

      <div className="mt-4 rounded-md bg-success-bg/30 p-3 ring-1 ring-inset ring-success-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-success">
          Total estimado de sugerencias aceptadas
        </p>
        <p className="mt-1 text-2xl font-bold text-success tabular-nums">
          {formatCop(metrics.acceptedEstTotal)}
        </p>
        <p className="mt-1 text-xs text-success">
          Suma del costo estimado (suggestedQty × estUnitCost) de las sugerencias
          que el dueño aceptó en el período.
        </p>
      </div>
    </section>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'purple' | 'emerald' | 'red' | 'gray';
}) {
  const cls = {
    amber: 'bg-warning-bg/30 text-warning ring-warning-border',
    purple: 'bg-muted text-foreground ring-purple-200',
    emerald: 'bg-success-bg/30 text-success ring-success-border',
    red: 'bg-destructive/10 text-destructive ring-destructive/30',
    gray: 'bg-muted/40 text-foreground ring-gray-200',
  }[tone];
  return (
    <div className={`rounded-md p-3 ring-1 ring-inset ${cls}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
