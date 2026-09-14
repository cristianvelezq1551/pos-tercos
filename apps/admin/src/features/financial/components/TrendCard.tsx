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
  // La escala también mide TODO lo restado: si no, la barra roja se salía del
  // alto disponible en los meses con pérdidas grandes.
  const maxValue = Math.max(...points.flatMap((p) => [p.revenue, p.revenue - p.netResult]), 1);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-foreground">Tendencia de los últimos meses</h2>
      <p className="text-xs text-muted-foreground">
        Barras: <span className="text-success">verde = ingresos</span> ·{' '}
        <span className="text-destructive">rojo = todo lo que se restó</span> (costo de lo vendido,
        costos fijos, gastos únicos y las pérdidas del mes). Si el verde le gana al rojo, ese mes
        ganaste, y es lo mismo que dice el número de abajo.
      </p>

      <div className="flex h-44 items-end gap-3 overflow-x-auto pb-2">
        {points.map((p) => {
          const incomeH = (p.revenue / maxValue) * 100;
          // TODO lo que se restó, no solo COGS + fijos: con la barra anterior
          // se podía ver el verde más alto que el rojo y un neto en rojo
          // debajo, porque faltaban los gastos únicos y las pérdidas del mes.
          const costos = p.revenue - p.netResult;
          const costH = (costos / maxValue) * 100;
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
                  title={`Todo lo que se restó: ${formatCop(costos)}`}
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
