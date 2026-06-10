import type { InventoryValuationReport } from '@pos-tercos/types';
import { Badge, Money } from '@pos-tercos/ui';
import { formatNumber } from '../../../lib/format';

export function InventoryValuationTable({ report }: { report: InventoryValuationReport }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">
          Valor total del inventario (a costo real)
        </span>
        <Money amount={report.totalValue} size="xl" weight="bold" />
      </div>

      {report.totalUnknownQty > 0 ? (
        <p className="text-xs text-warning">
          Hay {formatNumber(report.totalUnknownQty, { decimals: 2 })} unidades en bodega sin costo
          conocido (no entran en el valor).
        </p>
      ) : null}

      {report.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center text-sm text-muted-foreground">
          Sin existencias valorizadas.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Item
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tipo
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cantidad
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.items.map((it) => (
                <tr key={`${it.entityType}:${it.id}`} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium text-foreground">{it.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={it.entityType === 'INGREDIENT' ? 'success' : 'info'} size="sm">
                      {it.entityType === 'INGREDIENT' ? '🌾 Insumo' : '📦 Producto'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(it.qty, { decimals: 2 })}
                    {it.unknownQty > 0 ? (
                      <span className="ml-1 text-xs text-warning">
                        (+{formatNumber(it.unknownQty, { decimals: 2 })} s/costo)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {it.value > 0 ? <Money amount={it.value} /> : <span className="text-ink-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
