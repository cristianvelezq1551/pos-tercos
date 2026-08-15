import { PAYMENT_METHOD_LABELS, type ShiftSessionDetail } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';

const METHOD_LABELS: Record<string, string> = PAYMENT_METHOD_LABELS;

/** Arqueo digital del cierre: esperado (ventas) vs lo que mostró cada app. */
export function ShiftDigitalCountSection({
  breakdown,
}: {
  breakdown: ShiftSessionDetail['digitalCountBreakdown'];
}) {
  if (!breakdown || breakdown.length === 0) return null;
  const arqueadas = breakdown.filter((d) => d.counted !== null);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Arqueo digital (al cierre)
        </h3>
      </div>
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/20">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Método
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Esperado (ventas)
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Según la app
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Diferencia
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {breakdown.map((d) => (
            <tr key={d.method}>
              <td className="px-4 py-2.5 font-medium text-foreground">
                {METHOD_LABELS[d.method] ?? d.method}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatCop(d.expected)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {d.counted !== null ? formatCop(d.counted) : '— sin arquear'}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {d.difference === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : d.difference === 0 ? (
                  <span className="font-medium text-success">cuadra ✓</span>
                ) : (
                  <span
                    className={
                      d.difference < 0 ? 'font-semibold text-destructive' : 'font-semibold text-warning'
                    }
                  >
                    {d.difference > 0 ? '+' : ''}
                    {formatCop(d.difference)} {d.difference < 0 ? '(faltante)' : '(sobrante)'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-muted/20">
          <tr>
            <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total cuenta
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
              {formatCop(breakdown.reduce((a, d) => a + d.expected, 0))}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
              {arqueadas.length > 0
                ? formatCop(arqueadas.reduce((a, d) => a + (d.counted ?? 0), 0))
                : '— sin arquear'}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
              {arqueadas.length > 0
                ? formatCop(arqueadas.reduce((a, d) => a + (d.difference ?? 0), 0))
                : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
      {arqueadas.length > 0 && arqueadas.length < breakdown.length ? (
        <p className="px-4 py-2 text-xs text-warning">
          Quedaron medios sin arquear: el total contado es parcial.
        </p>
      ) : null}
    </section>
  );
}
