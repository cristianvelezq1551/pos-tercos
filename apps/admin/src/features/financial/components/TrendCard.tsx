import type { MonthlyTrend } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

/**
 * Tendencia compacta: por cada mes mostramos ingresos vs (cogs+fijos). Resultado
 * neto se ve por la diferencia de altura entre las dos barras. Sin libs.
 */
export function TrendCard({ trend }: { trend: MonthlyTrend }) {
  const points = trend.points;
  if (points.length === 0) {
    return null;
  }
  const maxValue = Math.max(
    ...points.flatMap((p) => [p.revenue, p.cogs + p.totalFixed]),
    1,
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-foreground">Tendencia de los últimos meses</h2>
      <p className="text-xs text-muted-foreground">
        Barras: <span className="text-success">verde = ingresos</span> ·{' '}
        <span className="text-destructive">rojo = costos totales (COGS + fijos)</span>. Si verde &gt; rojo
        ese mes ganaste.
      </p>

      <div className="flex h-44 items-end gap-3 overflow-x-auto pb-2">
        {points.map((p) => {
          const incomeH = (p.revenue / maxValue) * 100;
          const costH = ((p.cogs + p.totalFixed) / maxValue) * 100;
          const win = p.netResult >= 0;
          return (
            <div key={`${p.year}-${p.month}`} className="flex min-w-[64px] flex-1 flex-col items-center">
              <div className="flex h-32 w-full items-end justify-center gap-1">
                <div
                  className="w-3 rounded-sm bg-success/60"
                  style={{ height: `${incomeH}%` }}
                  title={`Ingresos: ${formatCop(p.revenue)}`}
                />
                <div
                  className="w-3 rounded-sm bg-destructive/60"
                  style={{ height: `${costH}%` }}
                  title={`Costos totales: ${formatCop(p.cogs + p.totalFixed)}`}
                />
              </div>
              <p className="mt-2 truncate text-[10px] text-muted-foreground capitalize">
                {p.monthLabel.split(' ')[0].slice(0, 3)}
              </p>
              <p
                className={`text-[10px] font-bold tabular-nums ${win ? 'text-success' : 'text-destructive'}`}
              >
                {win ? '+' : ''}
                {formatCop(p.netResult, { withSymbol: false })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
