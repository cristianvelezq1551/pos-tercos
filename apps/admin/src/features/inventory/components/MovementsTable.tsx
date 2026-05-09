import type { InventoryMovement, InventoryMovementType } from '@pos-tercos/types';
import {
  Badge,
  DataTable,
  EmptyState,
  Quantity,
  formatDate,
  type BadgeTone,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';

interface MovementsTableProps {
  rows: InventoryMovement[];
}

const TYPE_LABEL: Record<InventoryMovementType, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  WASTE: 'Merma',
  INITIAL: 'Stock inicial',
};

const TYPE_TONE: Record<InventoryMovementType, BadgeTone> = {
  PURCHASE: 'success',
  SALE: 'danger',
  MANUAL_ADJUSTMENT: 'primary',
  WASTE: 'warning',
  INITIAL: 'neutral',
};

export function MovementsTable({ rows }: MovementsTableProps) {
  const columns: DataTableColumn<InventoryMovement>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: (m) => (
        <time className="tabular text-xs text-muted-foreground" dateTime={m.createdAt}>
          {formatDate(m.createdAt, 'datetime')}
        </time>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      cell: (m) => (
        <Badge tone={TYPE_TONE[m.type]} size="sm">
          {TYPE_LABEL[m.type]}
        </Badge>
      ),
    },
    {
      key: 'item',
      header: 'Item',
      cell: (m) => (
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="font-medium text-foreground">
            {m.itemName ?? m.ingredientId ?? m.productId ?? '—'}
          </span>
          <StockableTypeBadge
            type={m.entityType === 'INGREDIENT' ? 'INGREDIENT' : 'PRODUCT'}
            size="sm"
          />
        </div>
      ),
    },
    {
      key: 'delta',
      header: 'Delta',
      align: 'right',
      numeric: true,
      cell: (m) => (
        <span
          className={`tabular font-semibold ${m.delta >= 0 ? 'text-success' : 'text-destructive'}`}
        >
          {m.delta >= 0 ? '+' : ''}
          <Quantity value={m.delta} decimals={4} className="text-current" />
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notas',
      hideOnMobile: true,
      cell: (m) =>
        m.notes ? (
          <span className="text-ink-600">{m.notes}</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'user',
      header: 'Por',
      hideOnMobile: true,
      cell: (m) =>
        m.userFullName ? (
          <span className="text-ink-600">{m.userFullName}</span>
        ) : (
          <span className="text-ink-300">sistema</span>
        ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(m) => m.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no hay movimientos"
          description="Cada compra, venta o ajuste manual queda registrada acá. La tabla es insert-only."
        />
      }
    />
  );
}
