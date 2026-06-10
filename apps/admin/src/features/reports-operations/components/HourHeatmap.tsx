import type { HourHeatmapReport } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function HourHeatmap({ report }: { report: HourHeatmapReport }) {
  // Map dow×hour → cell para lookup O(1).
  const cellMap = new Map<string, { count: number; revenue: number }>();
  let maxCount = 0;
  for (const c of report.cells) {
    cellMap.set(`${c.dow}-${c.hour}`, { count: c.count, revenue: c.revenue });
    if (c.count > maxCount) maxCount = c.count;
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Mapa de calor día × hora
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cantidad de ventas pagadas por día de la semana y hora. Útil para
          identificar picos de demanda.
        </p>
      </div>

      {report.cells.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin ventas en el período seleccionado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs tabular-nums">
            <thead>
              <tr>
                <th className="px-1 py-1 text-left text-[10px] font-semibold text-muted-foreground"></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th
                    key={h}
                    className="px-1 py-1 text-[10px] font-semibold text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((dayLabel, dow) => (
                <tr key={dow}>
                  <td className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                    {dayLabel}
                  </td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const cell = cellMap.get(`${dow}-${h}`);
                    const count = cell?.count ?? 0;
                    const ratio = maxCount > 0 ? count / maxCount : 0;
                    return (
                      <td key={h} className="p-0.5">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded text-[10px]"
                          style={{
                            backgroundColor: countColor(ratio),
                            color: ratio > 0.5 ? '#fff' : '#374151',
                          }}
                          title={
                            cell
                              ? `${dayLabel} ${h}h · ${count} ventas · ${formatCop(cell.revenue)}`
                              : `${dayLabel} ${h}h · sin ventas`
                          }
                        >
                          {count > 0 ? count : ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Color: claro = pocas ventas, oscuro = pico. Pasa el cursor sobre cada celda para ver los ingresos.
      </p>
    </section>
  );
}

function countColor(ratio: number): string {
  if (ratio === 0) return '#F2F1ED'; // ink-100 papel
  // Interpola hacia primary tizón (#B81F2A). Curva suave para que cells
  // bajos sean visibles pero diferenciables del pico.
  const t = Math.min(0.15 + ratio * 0.85, 1);
  const r = Math.round(251 - (251 - 184) * t); // 251 (red-50) → 184 (red-600)
  const g = Math.round(239 - (239 - 31) * t); // 239 → 31
  const b = Math.round(239 - (239 - 42) * t); // 239 → 42
  return `rgb(${r}, ${g}, ${b})`;
}
