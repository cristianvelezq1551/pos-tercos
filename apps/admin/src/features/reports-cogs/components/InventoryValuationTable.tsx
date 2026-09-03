import type { InventoryValuationItem, InventoryValuationReport } from '@pos-tercos/types';
import { Badge, DataTable, Money, type DataTableColumn } from '@pos-tercos/ui';
import { formatNumber } from '../../../lib/format';

export function InventoryValuationTable({ report }: { report: InventoryValuationReport }) {
  const columns: DataTableColumn<InventoryValuationItem>[] = [
    { key: 'name', header: 'Item', primary: true, cell: (it) => it.name },
    {
      key: 'type',
      header: 'Tipo',
      cell: (it) => (
        <Badge tone={it.entityType === 'INGREDIENT' ? 'success' : 'info'} size="sm">
          {it.entityType === 'INGREDIENT' ? '🌾 Insumo' : '📦 Producto'}
        </Badge>
      ),
    },
    {
      key: 'qty',
      header: 'Cantidad',
      align: 'right',
      numeric: true,
      cell: (it) => (
        <>
          {formatNumber(it.qty, { decimals: 2 })}
          {it.unknownQty > 0 ? (
            <span className="ml-1 text-xs text-warning">
              (+{formatNumber(it.unknownQty, { decimals: 2 })} s/costo)
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'value',
      header: 'Valor',
      align: 'right',
      numeric: true,
      cell: (it) =>
        it.value > 0 ? <Money amount={it.value} /> : <span className="text-muted-foreground">—</span>,
    },
  ];

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
        <DataTable
          rows={report.items}
          columns={columns}
          rowKey={(it) => `${it.entityType}:${it.id}`}
          className="rounded-lg"
        />
      )}
    </div>
  );
}
