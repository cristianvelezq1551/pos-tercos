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
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Sugerencias IA
        </h2>
        <p className="mt-1 text-xs text-gray-600">
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

      <div className="mt-4 rounded-md bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Total estimado de sugerencias aceptadas
        </p>
        <p className="mt-1 text-2xl font-bold text-emerald-900 tabular-nums">
          {formatCop(metrics.acceptedEstTotal)}
        </p>
        <p className="mt-1 text-xs text-emerald-700">
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
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    purple: 'bg-purple-50 text-purple-900 ring-purple-200',
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    red: 'bg-red-50 text-red-900 ring-red-200',
    gray: 'bg-gray-50 text-gray-700 ring-gray-200',
  }[tone];
  return (
    <div className={`rounded-md p-3 ring-1 ring-inset ${cls}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
