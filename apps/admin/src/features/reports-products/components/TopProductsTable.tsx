import type { TopProductsReport } from '@pos-tercos/types';
import { formatCop, formatNumber } from '../../../lib/format';

interface TopProductsTableProps {
  report: TopProductsReport;
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

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>#</Th>
            <Th>Producto</Th>
            <Th align="right">Cantidad</Th>
            <Th align="right">Revenue</Th>
            <Th>Distribución</Th>
            <Th align="right">Costo est.</Th>
            <Th align="right">Margen est.</Th>
            <Th align="right">% margen</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((p, i) => {
            const pct = topRevenue > 0 ? (p.revenue / topRevenue) * 100 : 0;
            const marginTone = marginColor(p.estMarginPct);
            return (
              <tr key={p.productId} className="transition-colors hover:bg-muted/40">
                <Td mono>{i + 1}</Td>
                <Td>
                  <span className="font-medium text-foreground">{p.productName}</span>
                </Td>
                <Td mono align="right">{formatNumber(p.quantity, { decimals: 0 })}</Td>
                <Td mono align="right">{formatCop(p.revenue)}</Td>
                <Td>
                  <div className="relative h-2 w-32 rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Td>
                <Td mono align="right">
                  {p.estCost === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    formatCop(p.estCost)
                  )}
                </Td>
                <Td mono align="right">
                  {p.estMargin === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={marginTone}>{formatCop(p.estMargin)}</span>
                  )}
                </Td>
                <Td mono align="right">
                  {p.estMarginPct === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={`font-medium ${marginTone}`}>
                      {formatNumber(p.estMarginPct * 100, { decimals: 1 })}%
                    </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        Costo estimado: receta directa (subproductos no expandidos).
        Productos sin <code>lastUnitCost</code> registrado muestran "—".
      </div>
    </div>
  );
}

function marginColor(pct: number | null): string {
  if (pct === null) return 'text-foreground';
  if (pct >= 0.5) return 'text-success';
  if (pct >= 0.3) return 'text-primary';
  if (pct >= 0.15) return 'text-warning';
  return 'text-destructive';
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
