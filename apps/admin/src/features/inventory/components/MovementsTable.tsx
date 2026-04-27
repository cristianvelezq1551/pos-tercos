import type { InventoryMovement, InventoryMovementType } from '@pos-tercos/types';

interface MovementsTableProps {
  rows: InventoryMovement[];
}

const TYPE_LABEL: Record<InventoryMovementType, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  WASTE: 'Merma',
  INITIAL: 'Stock inicial',
};

const TYPE_TONE: Record<InventoryMovementType, 'green' | 'red' | 'blue' | 'amber' | 'gray'> = {
  PURCHASE: 'green',
  SALE: 'red',
  MANUAL_ADJUSTMENT: 'blue',
  WASTE: 'amber',
  INITIAL: 'gray',
};

export function MovementsTable({ rows }: MovementsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">Aún no hay movimientos.</p>
        <p className="mt-1 text-sm text-gray-500">
          Cada compra, venta o ajuste manual queda registrada acá. La tabla es insert-only.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Fecha</Th>
            <Th>Tipo</Th>
            <Th>Insumo</Th>
            <Th align="right">Delta</Th>
            <Th>Notas</Th>
            <Th>Por</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50">
              <Td>
                <time className="font-mono text-xs text-gray-600" dateTime={m.createdAt}>
                  {formatDate(m.createdAt)}
                </time>
              </Td>
              <Td>
                <Badge tone={TYPE_TONE[m.type]}>{TYPE_LABEL[m.type]}</Badge>
              </Td>
              <Td>
                <span className="font-medium text-gray-900">
                  {m.ingredientName ?? m.ingredientId}
                </span>
              </Td>
              <Td align="right" mono>
                <span
                  className={
                    m.delta >= 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-700'
                  }
                >
                  {m.delta >= 0 ? '+' : ''}
                  {formatNumber(m.delta)}
                </span>
              </Td>
              <Td>
                <span className="text-gray-600">
                  {m.notes ?? <span className="text-gray-400">—</span>}
                </span>
              </Td>
              <Td>
                <span className="text-gray-600">
                  {m.userFullName ?? <span className="text-gray-400">sistema</span>}
                </span>
              </Td>
            </tr>
          ))}
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

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'green' | 'red' | 'blue' | 'amber' | 'gray';
}) {
  const map = {
    green: 'bg-green-50 text-green-700 ring-green-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/30',
    gray: 'bg-gray-100 text-gray-600 ring-gray-500/20',
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
