import * as React from 'react';
import { cn } from '../lib/utils';
import { LoadingSkeleton } from './loading-skeleton';

export interface DataTableColumn<T> {
  /** Identificador único de columna. */
  key: string;
  /** Título visible en `<th>`. */
  header: React.ReactNode;
  /** Render de la celda. Recibe el row entero. */
  cell: (row: T, rowIndex: number) => React.ReactNode;
  /** Alinear texto en celda y header. Default `left`. Numérico → `right`. */
  align?: 'left' | 'center' | 'right';
  /** Si true, aplica `tabular-nums` automáticamente (columnas numéricas). */
  numeric?: boolean;
  /** Width fijo (CSS). Ej: `'140px'` o `'12rem'`. */
  width?: string;
  /** Esconder en mobile (< sm). */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  /** Función que devuelve un id estable por row (key de React + selección futura). */
  rowKey: (row: T, index: number) => string | number;
  /** Render slot cuando rows.length === 0. */
  emptyState?: React.ReactNode;
  /** Si true, muestra skeleton rows. */
  loading?: boolean;
  /** Cuántas filas skeleton mostrar mientras loading. Default 5. */
  loadingRows?: number;
  /** Click en row — si está, las filas son clickeables (cursor pointer + hover). */
  onRowClick?: (row: T, index: number) => void;
  /** Clase extra al wrapper. */
  className?: string;
  /** Ocultar header (raro). */
  hideHeader?: boolean;
}

/**
 * Tabla canónica del sistema. Reemplaza ProductsTable, IngredientsTable, etc.
 *
 * Patrón:
 * - Header sticky con `bg-muted/40`, divisores muy sutiles entre filas.
 * - `tabular-nums` automático en columnas marcadas `numeric`.
 * - Empty state requerido (pasarlo como prop, NO blank).
 * - Loading skeleton built-in.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyState,
  loading = false,
  loadingRows = 5,
  onRowClick,
  className,
  hideHeader = false,
}: DataTableProps<T>) {
  const isInteractive = Boolean(onRowClick);

  if (loading) {
    return (
      <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
        <div className="space-y-px p-3">
          <LoadingSkeleton shape="table-row" count={loadingRows} />
        </div>
      </div>
    );
  }

  if (rows.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          {!hideHeader ? (
            <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'caps h-10 px-4 text-[0.6875rem] font-semibold text-muted-foreground',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      !col.align && 'text-left',
                      col.hideOnMobile && 'hidden sm:table-cell',
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((row, rowIndex) => {
              const key = rowKey(row, rowIndex);
              return (
                <tr
                  key={key}
                  className={cn(
                    'border-b border-border last:border-b-0 transition-colors duration-150',
                    isInteractive
                      ? 'cursor-pointer hover:bg-muted/40 focus-within:bg-muted/40'
                      : 'hover:bg-muted/20',
                  )}
                  onClick={isInteractive ? () => onRowClick?.(row, rowIndex) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'h-12 px-4 align-middle text-sm text-foreground',
                        col.numeric && 'tabular',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.hideOnMobile && 'hidden sm:table-cell',
                      )}
                    >
                      {col.cell(row, rowIndex)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
DataTable.displayName = 'DataTable';
