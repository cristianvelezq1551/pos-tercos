import type { Stockable } from '@pos-tercos/types';
import {
  Badge,
  DataTable,
  EmptyState,
  Quantity,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';

interface StockTableProps {
  rows: Stockable[];
}

export function StockTable({ rows }: StockTableProps) {
  const columns: DataTableColumn<Stockable>[] = [
    {
      key: 'type',
      header: 'Tipo',
      cell: (r) => <StockableTypeBadge type={r.type as 'INGREDIENT' | 'PRODUCT'} size="sm" />,
    },
    {
      key: 'item',
      header: 'Producto',
      cell: (r) => (
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-foreground">{r.name}</span>
          {r.category ? (
            <span className="text-xs text-muted-foreground">{r.category}</span>
          ) : null}
          {!r.isActive ? (
            <span className="text-xs font-medium text-ink-400">(inactivo)</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Existencias actuales',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className={r.lowStock ? 'font-semibold text-warning' : 'text-foreground'}>
          <Quantity value={r.currentStock} maxDecimals={4} className="text-current" />
        </span>
      ),
    },
    {
      key: 'unit',
      header: 'Unidad',
      hideOnMobile: true,
      cell: (r) => r.unitStock,
    },
    {
      key: 'threshold',
      header: 'Mínimo',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-muted-foreground">
          <Quantity value={r.thresholdMin} maxDecimals={4} className="text-current" />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (r) =>
        r.lowStock ? (
          <Badge tone="warning" size="sm" withDot>
            Bajo mínimo
          </Badge>
        ) : (
          <Badge tone="success" size="sm">
            OK
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => {
        const adjustHref = `/inventory/${r.type.toLowerCase()}/${r.id}/adjust`;
        const movementsHref = `/inventory/movements?entity_type=${r.type}&${
          r.type === 'INGREDIENT' ? 'ingredient_id' : 'product_id'
        }=${r.id}`;
        return (
          <span className="flex items-center justify-end gap-2">
            <Link href={adjustHref} className="text-sm font-medium text-primary hover:underline">
              Ajustar
            </Link>
            <span className="text-ink-300" aria-hidden>
              ·
            </span>
            <Link
              href={movementsHref}
              className="text-sm font-medium text-primary hover:underline"
            >
              Historial
            </Link>
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => `${r.type}:${r.id}`}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="No hay productos con inventario"
          description={
            <>
              Crea insumos en{' '}
              <Link href="/ingredients" className="text-primary hover:underline">
                Insumos
              </Link>{' '}
              o productos de reventa directa en{' '}
              <Link href="/products" className="text-primary hover:underline">
                Productos
              </Link>
              .
            </>
          }
        />
      }
    />
  );
}
