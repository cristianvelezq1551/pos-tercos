import {
  PAYMENT_METHOD_LABELS,
  saleTypeLabel,
  type PaymentMethod,
  type SalesSummary,
} from '@pos-tercos/types';
import { formatCop, formatNumber } from '../../../lib/format';

interface SalesSummaryViewProps {
  summary: SalesSummary;
}

const methodLabel = (m: string): string => PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m;

export function SalesSummaryView({ summary }: SalesSummaryViewProps) {
  const maxBucketRevenue = summary.buckets.reduce((m, b) => (b.revenue > m ? b.revenue : m), 0);
  return (
    <div className="space-y-6">
      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* El ingreso ya viene neto de descuentos; el detalle de abajo dice
            cuánto se regaló para que no se lea como "vendí menos". */}
        <Stat
          label="Ingresos"
          value={formatCop(summary.totals.revenue)}
          hint={
            summary.totals.discount > 0
              ? `${formatCop(summary.totals.revenue + summary.totals.discount)} a precio de lista − ${formatCop(summary.totals.discount)} de descuentos`
              : undefined
          }
        />
        <Stat label="Ventas" value={String(summary.totals.count)} />
        <Stat label="Ticket promedio" value={formatCop(summary.totals.avgTicket)} />
        <Stat
          label="Anuladas"
          value={String(summary.totals.voidCount)}
          tone={summary.totals.voidCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Serie temporal — gráfica horizontal de barras */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {summary.granularity === 'hourly' ? 'Por hora' : 'Por día'}
        </h2>
        {summary.buckets.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Sin ventas en el período seleccionado.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {summary.buckets.map((b) => {
              const pct = maxBucketRevenue > 0 ? (b.revenue / maxBucketRevenue) * 100 : 0;
              return (
                <div key={b.bucket} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 font-mono text-muted-foreground">
                    {formatBucket(b.bucket, summary.granularity)}
                  </span>
                  <div className="relative h-6 flex-1 rounded-md bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums font-medium text-foreground">
                    {formatCop(b.revenue)}
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                    {b.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="Por tipo de pedido"
          rows={summary.byType.map((t) => ({
            key: t.type,
            label: saleTypeLabel(t.type),
            count: t.count,
            revenue: t.revenue,
          }))}
          total={summary.totals.revenue}
        />
        <BreakdownTable
          title="Por método de pago"
          rows={summary.byMethod.map((m) => ({
            key: m.method,
            label: methodLabel(m.method),
            count: m.count,
            revenue: m.revenue,
          }))}
          total={summary.totals.revenue}
        />
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { key: string; label: string; count: number; revenue: number }[];
  total: number;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sin datos.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="pb-2 text-left font-semibold">Categoría</th>
              <th className="pb-2 text-right font-semibold">Ventas</th>
              <th className="pb-2 text-right font-semibold">Ingresos</th>
              <th className="pb-2 text-right font-semibold">% del total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const pct = total > 0 ? (r.revenue / total) * 100 : 0;
              return (
                <tr key={r.key}>
                  <td className="py-2 text-foreground">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{r.count}</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatCop(r.revenue)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(pct, { decimals: 1 })}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
  hint?: string;
}) {
  const valueClass = tone === 'warning' ? 'text-warning' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground tabular-nums">{hint}</p> : null}
    </div>
  );
}

function formatBucket(bucket: string, granularity: 'daily' | 'hourly'): string {
  if (granularity === 'hourly') {
    // YYYY-MM-DDTHH:00 → "DD/MM HH:00"
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/.exec(bucket);
    return m ? `${m[3]}/${m[2]} ${m[4]}:00` : bucket;
  }
  // YYYY-MM-DD → "DD/MM"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket);
  return m ? `${m[3]}/${m[2]}` : bucket;
}
