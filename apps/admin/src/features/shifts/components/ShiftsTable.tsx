import type { Shift } from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../lib/format';

interface Props {
  shifts: Shift[];
}

const STATUS_LABEL: Record<Shift['status'], string> = {
  OPEN: 'Abierto',
  CLOSED: 'Cerrado',
  RECONCILED: 'Reconciliado',
};

const STATUS_TONE: Record<Shift['status'], string> = {
  OPEN: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CLOSED: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  RECONCILED: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

export function ShiftsTable({ shifts }: Props) {
  if (shifts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">Aún no hay turnos registrados.</p>
        <p className="mt-1 text-sm text-gray-500">
          Cuando un cajero abra turno desde el POS aparecerá acá.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Cajero</Th>
            <Th>Apertura</Th>
            <Th>Cierre</Th>
            <Th align="right">Inicial</Th>
            <Th align="right">Esperado</Th>
            <Th align="right">Contado</Th>
            <Th align="right">Diferencia</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {shifts.map((s) => (
            <tr key={s.id} className="transition-colors hover:bg-gray-50">
              <Td>
                <span className="font-medium text-gray-900">
                  {s.cashierName ?? '—'}
                </span>
              </Td>
              <Td>{formatDate(s.openedAt, 'datetime')}</Td>
              <Td>
                {s.closedAt ? (
                  formatDate(s.closedAt, 'datetime')
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </Td>
              <Td align="right" mono>
                {formatCop(s.openingCash)}
              </Td>
              <Td align="right" mono>
                {s.expectedCash !== null ? (
                  formatCop(s.expectedCash)
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </Td>
              <Td align="right" mono>
                {s.countedCash !== null ? (
                  formatCop(s.countedCash)
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </Td>
              <Td align="right" mono>
                <DiffCell value={s.difference} />
              </Td>
              <Td>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[s.status]}`}
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiffCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  if (Math.abs(value) < 1) return <span className="text-emerald-700">{formatCop(0)}</span>;
  const tone =
    Math.abs(value) >= 5000
      ? value < 0
        ? 'text-red-700 font-bold'
        : 'text-amber-700 font-bold'
      : value < 0
        ? 'text-red-600'
        : 'text-amber-600';
  return (
    <span className={tone}>
      {value > 0 ? '+' : ''}
      {formatCop(value)}
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
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
