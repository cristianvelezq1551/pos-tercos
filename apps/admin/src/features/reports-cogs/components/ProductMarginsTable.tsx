import type { ProductMarginReport } from '@pos-tercos/types';
import { DataTable, type DataTableColumn } from '@pos-tercos/ui';
import { AlertTriangle } from 'lucide-react';
import { formatCop, formatNumber } from '../../../lib/format';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';

type Fila = ProductMarginReport['products'][number];

function claseDeMargen(marginPct: number | null): string {
  return marginPct === null ? 'text-foreground' : MARGIN_TONE_CLASS[marginTone(marginPct * 100)];
}

export function ProductMarginsTable({ report }: { report: ProductMarginReport }) {
  if (report.products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center text-sm text-muted-foreground">
        Sin ventas en el período.
      </div>
    );
  }

  const num = { align: 'right', numeric: true } as const;
  const columns: DataTableColumn<Fila>[] = [
    {
      key: 'name',
      header: 'Producto',
      primary: true,
      cell: (p) => (
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {p.productName}
          {p.cogsPartial ? (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-warning"
              aria-label="Costo parcialmente desconocido (insumos sin costo registrado)"
            />
          ) : null}
        </span>
      ),
    },
    {
      key: 'units',
      header: 'Unidades',
      ...num,
      cell: (p) => formatNumber(p.unitsSold, { decimals: 0 }),
    },
    { key: 'revenue', header: 'Ventas', ...num, cell: (p) => formatCop(p.revenue) },
    { key: 'cogs', header: 'Costo real', ...num, cell: (p) => formatCop(p.cogs) },
    {
      key: 'margin',
      header: 'Ganancia',
      ...num,
      cell: (p) => <span className={claseDeMargen(p.marginPct)}>{formatCop(p.margin)}</span>,
    },
    {
      key: 'marginPct',
      header: '% margen',
      ...num,
      cell: (p) =>
        p.marginPct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={`font-medium ${claseDeMargen(p.marginPct)}`}>
            {formatNumber(p.marginPct * 100, { decimals: 1 })}%
          </span>
        ),
    },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <DataTable
        rows={report.products}
        columns={columns}
        rowKey={(p) => p.productId}
        className="rounded-none border-0"
      />
      {/* Los totales van como tira propia y no como pie de la tabla: en
          teléfono las filas son tarjetas y un `tfoot` quedaría como una
          tarjeta más, indistinguible de un producto. */}
      <dl className="grid gap-x-6 gap-y-1 border-t-2 border-border bg-muted/40 px-4 py-3 text-sm font-semibold sm:grid-cols-4">
        <Total label="Ventas" valor={formatCop(report.totals.revenue)} />
        <Total label="Costo real" valor={formatCop(report.totals.cogs)} />
        <Total label="Ganancia" valor={formatCop(report.totals.margin)} />
        <Total
          label="% margen"
          valor={
            report.totals.marginPct === null
              ? '—'
              : `${formatNumber(report.totals.marginPct * 100, { decimals: 1 })}%`
          }
        />
      </dl>
      <div className="border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        Costo real por método FIFO (lote más viejo primero). ⚠ = parte del costo no se pudo
        determinar (insumos sin costo en facturas confirmadas).
      </div>
    </div>
  );
}

function Total({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="caps text-[0.6875rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{valor}</dd>
    </div>
  );
}
