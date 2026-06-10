import type { SupplierProduct } from '@pos-tercos/types';
import {
  DataTable,
  EmptyState,
  Money,
  formatDate,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';

interface Props {
  items: SupplierProduct[];
}

/**
 * FASE 4 ajustes 2.7: tabla de items que el proveedor vende, con su
 * último precio + última fecha de compra. Polimórfica (insumos +
 * productos direct-resale).
 */
export function SupplierProductsTable({ items }: Props) {
  const columns: DataTableColumn<SupplierProduct>[] = [
    {
      key: 'name',
      header: 'Insumo / producto',
      cell: (sp) => (
        <span className="font-medium text-foreground">{sp.name ?? '(eliminado)'}</span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      cell: (sp) => (
        <StockableTypeBadge
          type={sp.entityType === 'INGREDIENT' ? 'INGREDIENT' : 'PRODUCT'}
          size="sm"
        />
      ),
    },
    {
      key: 'lastPrice',
      header: 'Último precio',
      align: 'right',
      numeric: true,
      cell: (sp) =>
        sp.lastUnitPrice !== null ? (
          <Money amount={sp.lastUnitPrice} weight="medium" />
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'lastDate',
      header: 'Última compra',
      align: 'right',
      cell: (sp) =>
        sp.lastPurchaseDate ? (
          <span className="tabular text-sm">{formatDate(sp.lastPurchaseDate, 'short')}</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
  ];

  return (
    <DataTable
      rows={items}
      rowKey={(sp) => sp.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-cart" />}
          title="Este proveedor todavía no tiene compras confirmadas"
          size="sm"
        />
      }
    />
  );
}
