import type { ProductCostSummary, ProductMarginReport } from '@pos-tercos/types';
import { AlertTriangle } from 'lucide-react';
import { formatCop, formatNumber } from '../../../lib/format';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';
import { compararCostos } from '../lib/comparar-costos';
import { DiferenciaDeCostos } from './DiferenciaDeCostos';

export function ProductMarginsTable({
  report,
  costosParaPrecio = [],
}: {
  report: ProductMarginReport;
  /** Costo al ÚLTIMO precio de compra, por producto. El de la lista de
   *  productos y el editor de recetas: acá va al lado del real para que la
   *  diferencia se vea y se entienda en vez de sorprender. */
  costosParaPrecio?: ProductCostSummary[];
}) {
  const filas = compararCostos(report.products, costosParaPrecio);

  if (report.products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center text-sm text-muted-foreground">
        Sin ventas en el período.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Producto</Th>
            <Th align="right">Unidades</Th>
            <Th align="right">Ventas</Th>
            <Th align="right">Costo real</Th>
            <Th align="right">Costo para precio</Th>
            <Th align="right">Ganancia</Th>
            <Th align="right">% margen</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map(({ producto: p, refPeriodo, difiere }) => {
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
                <Td align="right" mono>{formatNumber(p.unitsSold, { decimals: 0 })}</Td>
                <Td align="right" mono>{formatCop(p.revenue)}</Td>
                <Td align="right" mono>{formatCop(p.cogs)}</Td>
                <Td align="right" mono>
                  {refPeriodo === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={difiere ? 'text-warning' : 'text-muted-foreground'}>
                      {formatCop(refPeriodo)}
                    </span>
                  )}
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
            <Td align="right" mono>{formatCop(report.totals.revenue)}</Td>
            <Td align="right" mono>{formatCop(report.totals.cogs)}</Td>
            <Td align="right" mono>{formatCop(report.totals.margin)}</Td>
            <Td align="right" mono>
              {report.totals.marginPct === null
                ? '—'
                : `${formatNumber(report.totals.marginPct * 100, { decimals: 1 })}%`}
            </Td>
          </tr>
        </tfoot>
      </table>
      <div className="space-y-1.5 border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Costo real</strong>: lo que costaron las unidades
          que de verdad saliste, al precio del lote que se consumió (FIFO, primero el más viejo).
          Es el que va al estado de resultados.{' '}
          <strong className="text-foreground">Costo para precio</strong>: lo que costaría hacerlas
          hoy, al último precio que pagaste por cada insumo. Es el que sirve para decidir a cuánto
          vender.
        </p>
        <p>⚠ = parte del costo no se pudo determinar (insumos sin costo en facturas confirmadas).</p>
      </div>
      <DiferenciaDeCostos filas={filas} />
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
