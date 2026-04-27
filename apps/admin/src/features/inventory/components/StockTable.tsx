import type { IngredientWithStock } from '@pos-tercos/types';
import Link from 'next/link';

interface StockTableProps {
  rows: IngredientWithStock[];
}

export function StockTable({ rows }: StockTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">No hay insumos cargados.</p>
        <p className="mt-1 text-sm text-gray-500">
          Creá insumos primero en la sección{' '}
          <Link href="/ingredients" className="text-blue-600 hover:underline">
            Insumos
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Insumo</Th>
            <Th align="right">Stock actual</Th>
            <Th>Unidad</Th>
            <Th align="right">Threshold</Th>
            <Th>Estado</Th>
            <Th align="right">Acción</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const rowClass = r.lowStock
              ? 'bg-amber-50/40 hover:bg-amber-50'
              : 'hover:bg-gray-50';
            return (
              <tr key={r.id} className={`transition-colors ${rowClass}`}>
                <Td>
                  <span className="font-medium text-gray-900">{r.name}</span>
                  {!r.isActive && (
                    <span className="ml-2 text-xs font-medium text-gray-400">(inactivo)</span>
                  )}
                </Td>
                <Td align="right" mono>
                  <span
                    className={
                      r.lowStock
                        ? 'font-semibold text-amber-700'
                        : 'text-gray-700'
                    }
                  >
                    {formatNumber(r.currentStock)}
                  </span>
                </Td>
                <Td>{r.unitRecipe}</Td>
                <Td align="right" mono className="text-gray-500">
                  {formatNumber(r.thresholdMin)}
                </Td>
                <Td>
                  {r.lowStock ? (
                    <Badge tone="warning">Stock crítico</Badge>
                  ) : (
                    <Badge tone="success">OK</Badge>
                  )}
                </Td>
                <Td align="right">
                  <Link
                    href={`/inventory/${r.id}/adjust`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Ajustar
                  </Link>
                  <span className="mx-2 text-gray-300">·</span>
                  <Link
                    href={`/inventory/movements?ingredient_id=${r.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Historial
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  className,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      } ${className ?? ''}`}
    >
      {children}
    </td>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'success' | 'warning' }) {
  const map = {
    success: 'bg-green-50 text-green-700 ring-green-600/20',
    warning: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}
