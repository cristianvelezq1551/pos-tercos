import type { StockCount } from '@pos-tercos/types';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import { DataTable, DateTimeCell, Quantity, type DataTableColumn } from '@pos-tercos/ui';

interface RecentCountsTableProps {
  counts: StockCount[];
}

export function RecentCountsTable({ counts }: RecentCountsTableProps) {
  if (counts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
        Todavía no hay conteos registrados.
      </p>
    );
  }

  const columns: DataTableColumn<StockCount>[] = [
    {
      key: 'item',
      header: 'Ítem',
      primary: true,
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          <StockableTypeBadge type={c.entityType} size="sm" iconOnly />
          <span className="font-medium text-foreground">{c.name}</span>
        </span>
      ),
    },
    { key: 'date', header: 'Fecha', cell: (c) => <DateTimeCell value={c.createdAt} /> },
    {
      key: 'counted',
      header: 'Contado',
      align: 'right',
      numeric: true,
      cell: (c) => <Quantity value={c.countedQty} unit={c.unit} maxDecimals={4} />,
    },
    {
      key: 'ledger',
      header: 'Ledger',
      align: 'right',
      numeric: true,
      cell: (c) => (
        <Quantity value={c.ledgerQty} maxDecimals={4} className="text-muted-foreground" />
      ),
    },
    {
      key: 'difference',
      header: 'Diferencia',
      align: 'right',
      numeric: true,
      cell: (c) => (
        <span
          className={
            c.difference === 0
              ? 'text-emerald-400'
              : c.difference < 0
                ? 'font-medium text-destructive'
                : 'text-amber-400'
          }
        >
          {c.difference > 0 ? '+' : ''}
          <Quantity value={c.difference} maxDecimals={4} className="text-current" />
        </span>
      ),
    },
    { key: 'who', header: 'Quién', cell: (c) => c.userName ?? '—' },
    {
      key: 'notes',
      header: 'Nota',
      hideOnMobile: true,
      cell: (c) => <span className="text-xs text-muted-foreground">{c.notes ?? '—'}</span>,
    },
  ];

  return (
    <DataTable rows={counts} columns={columns} rowKey={(c) => c.id} className="rounded-lg" />
  );
}
