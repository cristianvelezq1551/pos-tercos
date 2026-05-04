import type { PurchaseSuggestion } from '@pos-tercos/types';
import Link from 'next/link';
import { formatCop, formatNumber } from '../../../lib/format';

interface SuggestionsTableProps {
  suggestions: PurchaseSuggestion[];
}

export function SuggestionsTable({ suggestions }: SuggestionsTableProps) {
  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">
          Sin sugerencias en este filtro.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          El cron horario detecta stockables con stock por debajo del threshold y
          crea sugerencias automáticamente. También podés correr un scan manual.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Item</Th>
            <Th>Estado</Th>
            <Th>Stock</Th>
            <Th>Sugerido</Th>
            <Th>Costo est.</Th>
            <Th>Evaluado</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {suggestions.map((s) => (
            <tr key={s.id} className="transition-colors hover:bg-gray-50">
              <Td>
                <span className="font-medium text-gray-900">{s.entityName}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {s.entityType === 'INGREDIENT' ? '🌾 Insumo' : '📦 Producto'}
                </span>
              </Td>
              <Td>
                <StatusBadge status={s.status} />
              </Td>
              <Td mono>
                <span
                  className={s.currentStock < s.thresholdMin ? 'text-red-600 font-medium' : ''}
                >
                  {formatNumber(s.currentStock, { decimals: 1 })}
                </span>
                <span className="text-xs text-gray-500">
                  {' '}
                  / {formatNumber(s.thresholdMin, { decimals: 1 })}
                </span>
              </Td>
              <Td mono>
                {formatNumber(s.suggestedQty, { decimals: 0 })} {s.unitPurchase}
              </Td>
              <Td mono>{s.estTotal === null ? '—' : formatCop(s.estTotal)}</Td>
              <Td>
                {s.llmEvaluatedAt ? (
                  <span className="inline-flex items-center gap-1 text-xs text-purple-700">
                    <span aria-hidden>🤖</span>
                    sí
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </Td>
              <Td align="right">
                <Link
                  href={`/purchase-suggestions/${s.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Ver
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: PurchaseSuggestion['status'] }) {
  const cfg = {
    PENDING: {
      label: 'Pendiente',
      cls: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    },
    EVALUATED: {
      label: 'Evaluada',
      cls: 'bg-purple-50 text-purple-700 ring-purple-600/20',
    },
    ACCEPTED: {
      label: 'Aceptada',
      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    },
    REJECTED: {
      label: 'Rechazada',
      cls: 'bg-red-50 text-red-700 ring-red-600/20',
    },
    STALE: {
      label: 'Vencida',
      cls: 'bg-gray-100 text-gray-600 ring-gray-500/20',
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.cls}`}
    >
      {cfg.label}
    </span>
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
