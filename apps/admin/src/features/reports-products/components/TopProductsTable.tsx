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
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">
          Sin ventas en el período seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
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
        <tbody className="divide-y divide-gray-100">
          {products.map((p, i) => {
            const pct = topRevenue > 0 ? (p.revenue / topRevenue) * 100 : 0;
            const marginTone = marginColor(p.estMarginPct);
            return (
              <tr key={p.productId} className="transition-colors hover:bg-gray-50">
                <Td mono>{i + 1}</Td>
                <Td>
                  <span className="font-medium text-gray-900">{p.productName}</span>
                </Td>
                <Td mono align="right">{formatNumber(p.quantity, { decimals: 0 })}</Td>
                <Td mono align="right">{formatCop(p.revenue)}</Td>
                <Td>
                  <div className="relative h-2 w-32 rounded-full bg-gray-100">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Td>
                <Td mono align="right">
                  {p.estCost === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    formatCop(p.estCost)
                  )}
                </Td>
                <Td mono align="right">
                  {p.estMargin === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <span className={marginTone}>{formatCop(p.estMargin)}</span>
                  )}
                </Td>
                <Td mono align="right">
                  {p.estMarginPct === null ? (
                    <span className="text-gray-400">—</span>
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
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        Costo estimado: receta directa (subproductos no expandidos).
        Productos sin <code>lastUnitCost</code> registrado muestran "—".
      </div>
    </div>
  );
}

function marginColor(pct: number | null): string {
  if (pct === null) return 'text-gray-700';
  if (pct >= 0.5) return 'text-emerald-700';
  if (pct >= 0.3) return 'text-blue-700';
  if (pct >= 0.15) return 'text-amber-700';
  return 'text-red-700';
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
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
      className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
