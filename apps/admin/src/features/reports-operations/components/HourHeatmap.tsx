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
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Heatmap día × hora
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          Cantidad de ventas pagadas por día de la semana y hora. Útil para
          identificar picos de demanda.
        </p>
      </div>

      {report.cells.length === 0 ? (
        <p className="text-sm text-gray-500">Sin ventas en el período seleccionado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs tabular-nums">
            <thead>
              <tr>
                <th className="px-1 py-1 text-left text-[10px] font-semibold text-gray-500"></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th
                    key={h}
                    className="px-1 py-1 text-[10px] font-semibold text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((dayLabel, dow) => (
                <tr key={dow}>
                  <td className="px-2 py-1 text-[10px] font-semibold text-gray-600">
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

      <p className="mt-3 text-[11px] text-gray-500">
        Color: claro = pocas ventas, oscuro = pico. Hover muestra revenue.
      </p>
    </section>
  );
}

function countColor(ratio: number): string {
  if (ratio === 0) return '#f9fafb'; // gray-50
  // Interpola hacia blue-700 (#1d4ed8). Curva suave para que cells bajos
  // sean visibles pero diferenciables del pico.
  const t = Math.min(0.15 + ratio * 0.85, 1);
  const r = Math.round(239 - (239 - 29) * t); // 239 → 29
  const g = Math.round(246 - (246 - 78) * t); // 246 → 78
  const b = Math.round(255 - (255 - 216) * t); // 255 → 216
  return `rgb(${r}, ${g}, ${b})`;
}
