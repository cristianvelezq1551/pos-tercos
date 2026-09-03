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
  /**
   * En teléfono esta columna encabeza la tarjeta: va sola, arriba y sin
   * etiqueta. Si ninguna la declara, encabeza la primera columna visible.
   */
  primary?: boolean;
  /**
   * Etiqueta de la fila en modo tarjeta. Default: `header`. Úsala cuando el
   * header trae adornos (un `<span title>` largo) que no sirven de rótulo.
   * `false` deja el valor a lo ancho, sin etiqueta — para acciones.
   */
  mobileLabel?: React.ReactNode | false;
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

/** Un header vacío no es un rótulo: es una columna de acciones o de adorno. */
function labelVacia(label: React.ReactNode): boolean {
  return label === false || label === null || label === undefined || label === '';
}

/**
 * Tabla canónica del sistema. Reemplaza ProductsTable, IngredientsTable, etc.
 *
 * Patrón:
 * - Header sticky con `bg-muted/40`, divisores muy sutiles entre filas.
 * - `tabular-nums` automático en columnas marcadas `numeric`.
 * - Empty state requerido (pasarlo como prop, NO blank).
 * - Loading skeleton built-in.
 *
 * En teléfono (< sm) NO es una tabla: cada fila se rinde como una tarjeta con
 * `etiqueta → valor`. Una tabla de 8 columnas metida en 390 px parte cada celda
 * en cinco líneas y esconde las últimas columnas detrás de un scroll lateral
 * que nadie descubre. La estructura HTML es la MISMA (una sola `<table>`), así
 * que ningún componente de celda se monta dos veces.
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

  // La que encabeza la tarjeta: la declarada `primary`, o la primera que se ve
  // en teléfono y tiene rótulo (así una columna de acciones nunca es el título).
  const primaryKey =
    columns.find((c) => c.primary)?.key ??
    columns.find((c) => !c.hideOnMobile && !labelVacia(c.mobileLabel ?? c.header))?.key;

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
      <div className="overflow-x-auto max-sm:overflow-x-visible">
        <table className="w-full caption-bottom text-sm max-sm:block">
          {!hideHeader ? (
            <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm max-sm:hidden">
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
          <tbody className="max-sm:block">
            {rows.map((row, rowIndex) => {
              const key = rowKey(row, rowIndex);
              return (
                <tr
                  key={key}
                  className={cn(
                    'border-b border-border last:border-b-0 transition-colors duration-150',
                    'max-sm:block max-sm:px-4 max-sm:py-3',
                    isInteractive
                      ? 'cursor-pointer hover:bg-muted/40 focus-within:bg-muted/40'
                      : 'hover:bg-muted/20',
                  )}
                  onClick={isInteractive ? () => onRowClick?.(row, rowIndex) : undefined}
                >
                  {columns.map((col) => {
                    const esPrimaria = col.key === primaryKey;
                    const label = col.mobileLabel ?? col.header;
                    const conEtiqueta = !esPrimaria && !labelVacia(label);
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'h-12 px-4 align-middle text-sm text-foreground',
                          col.numeric && 'tabular',
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center',
                          col.hideOnMobile && 'hidden sm:table-cell',
                          // Tarjeta: fila de `etiqueta ─── valor`, sin altura fija.
                          // Las clases `max-sm:` van DESPUÉS de `hidden` en la
                          // hoja generada, así que una columna oculta en móvil
                          // volvería a mostrarse si le diéramos `max-sm:flex`.
                          !col.hideOnMobile && [
                            'max-sm:flex max-sm:h-auto max-sm:min-h-0 max-sm:items-baseline',
                            'max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-0.5',
                            'max-sm:text-left',
                            esPrimaria && 'max-sm:block max-sm:pb-1.5 max-sm:font-medium',
                            // Celda sin rótulo = acciones de la fila. En la
                            // tarjeta va como barra propia, separada del dato,
                            // y sus enlaces se estiran a 44 px: un "Editar" de
                            // 16 px de alto no se acierta con el pulgar.
                            !esPrimaria &&
                              !conEtiqueta &&
                              [
                                'max-sm:mt-1.5 max-sm:justify-start max-sm:border-t',
                                'max-sm:border-border/60 max-sm:pt-0.5',
                                'max-sm:[&_a]:inline-flex max-sm:[&_a]:min-h-11 max-sm:[&_a]:items-center',
                                'max-sm:[&_button]:inline-flex max-sm:[&_button]:min-h-11',
                                'max-sm:[&_button]:items-center',
                              ],
                          ],
                        )}
                      >
                        {conEtiqueta ? (
                          <span className="caps hidden shrink-0 text-[0.6875rem] font-semibold text-muted-foreground max-sm:block">
                            {label}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'sm:contents',
                            !esPrimaria && 'max-sm:min-w-0 max-sm:text-right',
                            esPrimaria && 'max-sm:block max-sm:min-w-0',
                          )}
                        >
                          {col.cell(row, rowIndex)}
                        </span>
                      </td>
                    );
                  })}
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
