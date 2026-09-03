import type { InventoryMovement, InventoryMovementType } from '@pos-tercos/types';
import {
  Badge,
  DataTable,
  DateTimeCell,
  EmptyState,
  Quantity,
  type BadgeTone,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import { ReverseWasteAction } from './ReverseWasteAction';

interface MovementsTableProps {
  rows: InventoryMovement[];
  /** De dónde se cuenta lo ya devuelto de cada merma. Default: las filas
   *  visibles. Con la lista filtrada hay que pasar la COMPLETA: si no, una
   *  merma cuya reversa quedó fuera del filtro vuelve a ofrecer "Anular". */
  reversalSource?: InventoryMovement[];
}

const TYPE_LABEL: Record<InventoryMovementType, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  WASTE: 'Merma',
  INITIAL: 'Stock inicial',
  PRODUCTION: 'Producción',
};

const TYPE_TONE: Record<InventoryMovementType, BadgeTone> = {
  PURCHASE: 'success',
  SALE: 'danger',
  MANUAL_ADJUSTMENT: 'primary',
  WASTE: 'warning',
  INITIAL: 'neutral',
  PRODUCTION: 'info',
};

export function MovementsTable({ rows, reversalSource }: MovementsTableProps) {
  // Cuánto se devolvió ya de cada merma, según las filas cargadas.
  const reversedByWaste = new Map<string, number>();
  for (const m of reversalSource ?? rows) {
    if (m.sourceType === 'waste_reversal' && m.sourceId) {
      reversedByWaste.set(m.sourceId, (reversedByWaste.get(m.sourceId) ?? 0) + m.delta);
    }
  }

  const columns: DataTableColumn<InventoryMovement>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: (m) => (
        <DateTimeCell value={m.createdAt} />
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
      header: 'Producto',
      cell: (m) => (
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="font-medium text-foreground">
            {m.itemName ?? m.ingredientId ?? m.productId ?? m.subproductId ?? '—'}
          </span>
          <StockableTypeBadge type={m.entityType} size="sm" />
        </div>
      ),
    },
    {
      key: 'delta',
      header: 'Cambio',
      align: 'right',
      numeric: true,
      cell: (m) => (
        <span
          className={`tabular font-semibold ${m.delta >= 0 ? 'text-success' : 'text-destructive'}`}
        >
          {m.delta >= 0 ? '+' : ''}
          <Quantity value={m.delta} maxDecimals={4} className="text-current" />
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notas',
      hideOnMobile: true,
      cell: (m) => (
        <span className="flex flex-wrap items-center gap-2">
          {m.notes ? (
            <span className="text-muted-foreground">{m.notes}</span>
          ) : (
            <span className="text-ink-300">—</span>
          )}
          {m.evidenceUrl ? (
            <a
              href={m.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              📷 Evidencia
            </a>
          ) : null}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Por',
      hideOnMobile: true,
      cell: (m) =>
        m.userFullName ? (
          <span className="text-muted-foreground">{m.userFullName}</span>
        ) : (
          <span className="text-ink-300">sistema</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      // Anular una merma es la ÚNICA forma de sacar esa pérdida del estado
      // financiero (el ledger devuelve el costo original). Se oculta cuando ya
      // se devolvió todo; el backend es igual la autoridad si la reversa no
      // estaba en las filas cargadas.
      cell: (m) =>
        m.type === 'WASTE' && (reversedByWaste.get(m.id) ?? 0) < Math.abs(m.delta) - 1e-9 ? (
          <ReverseWasteAction movement={m} />
        ) : null,
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
          description="Cada compra, venta o ajuste manual queda registrada aquí. Los registros no se borran ni se editan; las correcciones se hacen con un nuevo movimiento."
        />
      }
    />
  );
}
