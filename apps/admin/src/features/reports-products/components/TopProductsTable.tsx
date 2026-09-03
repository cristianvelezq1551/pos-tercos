import type { TopProductsReport } from '@pos-tercos/types';
import { DataTable, type DataTableColumn } from '@pos-tercos/ui';
import { formatCop, formatNumber } from '../../../lib/format';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';

interface TopProductsTableProps {
  report: TopProductsReport;
}

type Fila = TopProductsReport['products'][number];

/** Escala unificada con el resto del admin (lib/margin-thresholds).
 *  estMarginPct viene como fracción (0..1) → ×100 para el umbral en %. */
function marginClass(pct: number | null): string {
  return pct === null ? 'text-foreground' : MARGIN_TONE_CLASS[marginTone(pct * 100)];
}

export function TopProductsTable({ report }: TopProductsTableProps) {
  const products = report.products;
  const topRevenue = products[0]?.revenue ?? 0;

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center">
        <p className="text-sm font-medium text-foreground">
          Sin ventas en el período seleccionado.
        </p>
      </div>
    );
  }

  const num = { align: 'right', numeric: true } as const;
  const columns: DataTableColumn<Fila>[] = [
    {
      key: 'name',
      header: 'Producto',
      primary: true,
      cell: (p) => {
        const puesto = products.indexOf(p) + 1;
        return (
          <span className="flex items-baseline gap-2">
            <span className="tabular-nums text-xs text-muted-foreground">{puesto}.</span>
            <span className="font-medium text-foreground">{p.productName}</span>
          </span>
        );
      },
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      ...num,
      cell: (p) => formatNumber(p.quantity, { decimals: 0 }),
    },
    { key: 'revenue', header: 'Ingresos', ...num, cell: (p) => formatCop(p.revenue) },
    {
      key: 'share',
      header: 'Distribución',
      // La barra compara contra el primero: sin las otras filas al lado no
      // dice nada, así que en teléfono no ocupa una línea de la tarjeta.
      hideOnMobile: true,
      cell: (p) => (
        <div className="relative h-2 w-32 rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${topRevenue > 0 ? (p.revenue / topRevenue) * 100 : 0}%` }}
          />
        </div>
      ),
    },
    {
      key: 'estCost',
      header: 'Costo est.',
      ...num,
      cell: (p) =>
        p.estCost === null ? <span className="text-muted-foreground">—</span> : formatCop(p.estCost),
    },
    {
      key: 'estMargin',
      header: 'Margen est.',
      ...num,
      cell: (p) =>
        p.estMargin === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={marginClass(p.estMarginPct)}>{formatCop(p.estMargin)}</span>
        ),
    },
    {
      key: 'estMarginPct',
      header: '% margen',
      ...num,
      cell: (p) =>
        p.estMarginPct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={`font-medium ${marginClass(p.estMarginPct)}`}>
            {formatNumber(p.estMarginPct * 100, { decimals: 1 })}%
          </span>
        ),
    },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <DataTable
        rows={products}
        columns={columns}
        rowKey={(p) => p.productId}
        className="rounded-none border-0"
      />
      <div className="border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        Costo <strong>estimado</strong> con el último precio de compra de cada insumo,
        desglosando recetas y subproductos, y costeando la variante que se vendió (un plato con
        variantes se vende siempre con una elegida). Es una referencia rápida — para el costo real
        por lote consulta{' '}
        <a href="/reports/costos" className="underline hover:text-foreground">
          Costos y margen real
        </a>{' '}
        (FIFO). Los productos sin costo registrado muestran "—".
      </div>
    </div>
  );
}
