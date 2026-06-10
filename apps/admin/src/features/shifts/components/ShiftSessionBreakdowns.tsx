import type { ShiftSessionDetail } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';
import { METHOD_LABEL, TYPE_LABEL } from './shift-session-labels';

export function ShiftSessionBreakdowns({ summary }: { summary: ShiftSessionDetail['summary'] }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <BreakdownTable
        title="Por método de pago"
        rows={summary.byMethod.map((m) => ({
          label: METHOD_LABEL[m.method] ?? m.method,
          count: m.count,
          total: m.total,
        }))}
      />
      <BreakdownTable
        title="Por tipo de venta"
        rows={summary.byType.map((t) => ({
          label: TYPE_LABEL[t.type] ?? t.type,
          count: t.count,
          total: t.total,
        }))}
      />
    </section>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; total: number }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Sin datos.</p>
      ) : (
        <table className="min-w-full divide-y divide-border text-sm">
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-4 py-2.5 text-foreground">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.count}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">
                  {formatCop(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
