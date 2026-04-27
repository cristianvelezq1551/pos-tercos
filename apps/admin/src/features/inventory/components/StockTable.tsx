import type { Stockable } from '@pos-tercos/types';
import Link from 'next/link';

interface StockTableProps {
  rows: Stockable[];
}

export function StockTable({ rows }: StockTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">No hay items con stock.</p>
        <p className="mt-1 text-sm text-gray-500">
          Creá insumos en{' '}
          <Link href="/ingredients" className="text-blue-600 hover:underline">
            Insumos
          </Link>{' '}
          o productos direct-resale en{' '}
          <Link href="/products" className="text-blue-600 hover:underline">
            Productos
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
            <Th>Tipo</Th>
            <Th>Item</Th>
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
            const adjustHref = `/inventory/${r.type.toLowerCase()}/${r.id}/adjust`;
            const movementsHref = `/inventory/movements?entity_type=${r.type}&${r.type === 'INGREDIENT' ? 'ingredient_id' : 'product_id'}=${r.id}`;
            return (
              <tr key={`${r.type}:${r.id}`} className={`transition-colors ${rowClass}`}>
                <Td>
                  <TypeBadge type={r.type} />
                </Td>
                <Td>
                  <span className="font-medium text-gray-900">{r.name}</span>
                  {r.category && (
                    <span className="ml-2 text-xs text-gray-500">{r.category}</span>
                  )}
                  {!r.isActive && (
                    <span className="ml-2 text-xs font-medium text-gray-400">(inactivo)</span>
                  )}
                </Td>
                <Td align="right" mono>
                  <span
                    className={
                      r.lowStock ? 'font-semibold text-amber-700' : 'text-gray-700'
                    }
                  >
                    {formatNumber(r.currentStock)}
                  </span>
                </Td>
                <Td>{r.unitStock}</Td>
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
                  <Link href={adjustHref} className="font-medium text-blue-600 hover:underline">
                    Ajustar
                  </Link>
                  <span className="mx-2 text-gray-300">·</span>
                  <Link href={movementsHref} className="font-medium text-blue-600 hover:underline">
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

function TypeBadge({ type }: { type: 'INGREDIENT' | 'PRODUCT' }) {
  const cls =
    type === 'INGREDIENT'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
      : 'bg-blue-50 text-blue-700 ring-blue-600/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {type === 'INGREDIENT' ? '🌾 Insumo' : '📦 Producto'}
    </span>
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
