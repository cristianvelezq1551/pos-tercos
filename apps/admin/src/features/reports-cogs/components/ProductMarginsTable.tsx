import type { ProductMarginReport } from '@pos-tercos/types';
import { AlertTriangle } from 'lucide-react';
import { formatCop, formatNumber } from '../../../lib/format';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';

export function ProductMarginsTable({ report }: { report: ProductMarginReport }) {
  if (report.products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center text-sm text-muted-foreground">
        Sin ventas en el período.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <Th>Producto</Th>
              <Th align="right">Unidades</Th>
              <Th align="right">Ventas</Th>
              <Th align="right">Costo real</Th>
              <Th align="right">Ganancia</Th>
              <Th align="right">% margen</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.products.map((p) => {
              const pct = p.marginPct === null ? null : p.marginPct * 100;
              const cls = pct === null ? 'text-foreground' : MARGIN_TONE_CLASS[marginTone(pct)];
              return (
                <tr key={p.productId} className="hover:bg-muted/40">
                  <Td>
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {p.productName}
                      {p.cogsPartial ? (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-warning"
                          aria-label="Costo parcialmente desconocido (insumos sin costo registrado)"
                        />
                      ) : null}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {formatNumber(p.unitsSold, { decimals: 0 })}
                  </Td>
                  <Td align="right" mono>
                    {formatCop(p.revenue)}
                  </Td>
                  <Td align="right" mono>
                    {formatCop(p.cogs)}
                  </Td>
                  <Td align="right" mono>
                    <span className={cls}>{formatCop(p.margin)}</span>
                  </Td>
                  <Td align="right" mono>
                    {pct === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={`font-medium ${cls}`}>
                        {formatNumber(pct, { decimals: 1 })}%
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border bg-muted/40 font-semibold">
            <tr>
              <Td>Total</Td>
              <Td align="right"> </Td>
              <Td align="right" mono>
                {formatCop(report.totals.revenue)}
              </Td>
              <Td align="right" mono>
                {formatCop(report.totals.cogs)}
              </Td>
              <Td align="right" mono>
                {formatCop(report.totals.margin)}
              </Td>
              <Td align="right" mono>
                {report.totals.marginPct === null
                  ? '—'
                  : `${formatNumber(report.totals.marginPct * 100, { decimals: 1 })}%`}
              </Td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        Costo real por método FIFO (lote más viejo primero). ⚠ = parte del costo no se pudo
        determinar (insumos sin costo en facturas confirmadas).
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
