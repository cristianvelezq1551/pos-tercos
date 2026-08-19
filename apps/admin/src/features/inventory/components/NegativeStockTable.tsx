import type { Stockable } from '@pos-tercos/types';
import { DataTable, EmptyState, Quantity, type DataTableColumn } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';

/** Filtro de /inventory/movements según el tipo (los 3 son polimórficos). */
const MOVEMENT_PARAM: Record<Stockable['type'], string> = {
  INGREDIENT: 'ingredient_id',
  PRODUCT: 'product_id',
  SUBPRODUCT: 'subproduct_id',
};

/** La acción que salda la deuda depende de cómo entra el stock de ese tipo. */
function fixFor(row: Stockable): { label: string; href: string; hint: string } {
  if (row.type === 'SUBPRODUCT') {
    return {
      label: 'Registrar producción',
      href: `/subproducts/${row.id}`,
      hint: 'Se produjo en cocina y no se registró',
    };
  }
  return {
    label: 'Subir factura',
    href: '/invoices/new',
    hint: 'Falta subir la factura de compra',
  };
}

/**
 * Deuda de inventario: stockables en NEGATIVO. Ordenados por faltante más
 * grande primero (lo trae así el backend).
 */
export function NegativeStockTable({ rows }: { rows: Stockable[] }) {
  const columns: DataTableColumn<Stockable>[] = [
    {
      key: 'type',
      header: 'Tipo',
      cell: (r) => <StockableTypeBadge type={r.type} size="sm" />,
    },
    {
      key: 'item',
      header: 'Insumo',
      cell: (r) => (
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-foreground">{r.name}</span>
          {r.category ? <span className="text-xs text-muted-foreground">{r.category}</span> : null}
          {!r.isActive ? <span className="text-xs font-medium text-ink-400">(inactivo)</span> : null}
        </span>
      ),
    },
    {
      key: 'debt',
      header: 'Faltante',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="font-semibold text-destructive">
          <Quantity value={Math.abs(r.currentStock)} maxDecimals={4} className="text-current" />
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
      key: 'hint',
      header: 'Causa probable',
      hideOnMobile: true,
      cell: (r) => <span className="text-sm text-muted-foreground">{fixFor(r).hint}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => {
        const fix = fixFor(r);
        const movementsHref = `/inventory/movements?entity_type=${r.type}&${MOVEMENT_PARAM[r.type]}=${r.id}`;
        return (
          <span className="flex items-center justify-end gap-2">
            <Link href={fix.href} className="text-sm font-semibold text-primary hover:underline">
              {fix.label}
            </Link>
            <span className="text-ink-300" aria-hidden>
              ·
            </span>
            <Link href={movementsHref} className="text-sm font-medium text-primary hover:underline">
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
          title="Sin deudas de inventario"
          description="Ningún insumo está en negativo: todo lo que se vendió tiene su compra o producción registrada."
        />
      }
    />
  );
}
