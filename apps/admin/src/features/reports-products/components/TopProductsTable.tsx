import type { TopProductsReport } from '@pos-tercos/types';
import { formatCop, formatNumber } from '../../../lib/format';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';

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
            <Th align="right">Ingresos</Th>
            <Th>Distribución</Th>
            <Th align="right">Costo est.</Th>
            <Th align="right">Margen est.</Th>
            <Th align="right">% margen</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((p, i) => {
            const pct = topRevenue > 0 ? (p.revenue / topRevenue) * 100 : 0;
            // Escala unificada con el resto del admin (lib/margin-thresholds).
            // estMarginPct viene como fracción (0..1) → ×100 para el umbral en %.
            const marginClass =
              p.estMarginPct === null
                ? 'text-foreground'
                : MARGIN_TONE_CLASS[marginTone(p.estMarginPct * 100)];
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
                    <span className={marginClass}>{formatCop(p.estMargin)}</span>
                  )}
                </Td>
                <Td mono align="right">
                  {p.estMarginPct === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={`font-medium ${marginClass}`}>
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
        Costo <strong>estimado</strong> con el último precio de compra (lastUnitCost), desglosando
        recetas y subproductos. Es una referencia rápida — para el costo real por lote consulta{' '}
        <a href="/reports/costos" className="underline hover:text-foreground">Costos y margen real</a> (FIFO).
        Los productos sin costo registrado muestran "—".
      </div>
    </div>
  );
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
