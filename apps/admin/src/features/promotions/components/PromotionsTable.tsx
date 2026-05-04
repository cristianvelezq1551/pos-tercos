import type { Promotion } from '@pos-tercos/types';
import Link from 'next/link';
import { formatCop } from '../../../lib/format';

interface PromotionsTableProps {
  promotions: Promotion[];
}

export function PromotionsTable({ promotions }: PromotionsTableProps) {
  if (promotions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">Aún no creaste promociones.</p>
        <p className="mt-1 text-sm text-gray-500">
          Las promos aplican automáticamente al cobrar la venta. 4 tipos: descuento %,
          descuento fijo, BOGO (lleva X paga Y) y combo.
        </p>
        <Link
          href="/promotions/new"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Crear primera promoción
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Nombre</Th>
            <Th>Tipo</Th>
            <Th>Descuento</Th>
            <Th>Días</Th>
            <Th>Horario</Th>
            <Th>Vigencia</Th>
            <Th>Productos</Th>
            <Th>Estado</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {promotions.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-gray-50">
              <Td>
                <span className="font-medium text-gray-900">{p.name}</span>
              </Td>
              <Td>
                <TypeBadge type={p.type} />
              </Td>
              <Td mono>{describeDiscount(p)}</Td>
              <Td mono>{describeDays(p.daysOfWeekMask)}</Td>
              <Td mono>
                {hhmm(p.timeStart)}–{hhmm(p.timeEnd)}
              </Td>
              <Td mono>{describeRange(p.activeFrom, p.activeTo)}</Td>
              <Td mono>{p.productIds.length}</Td>
              <Td>
                {p.isActive ? (
                  <Badge tone="success">Activa</Badge>
                ) : (
                  <Badge tone="muted">Inactiva</Badge>
                )}
              </Td>
              <Td align="right">
                <Link
                  href={`/promotions/${p.id}`}
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

function describeDiscount(p: Promotion): string {
  switch (p.type) {
    case 'PERCENT_OFF':
      return p.discountPct !== null ? `${(p.discountPct * 100).toFixed(0)}%` : '—';
    case 'FIXED_OFF':
      return p.discountFixed !== null ? formatCop(p.discountFixed) : '—';
    case 'BOGO':
      return `${p.bogoBuyQty ?? '?'}+${p.bogoGetQty ?? '?'}`;
    case 'COMBO_OFF': {
      if (p.discountPct !== null) return `${(p.discountPct * 100).toFixed(0)}% combo`;
      if (p.discountFixed !== null) return `${formatCop(p.discountFixed)} combo`;
      return '—';
    }
  }
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function describeDays(mask: number): string {
  if (mask === 127) return 'Todos';
  const days = [];
  for (let i = 0; i < 7; i++) {
    if ((mask & (1 << i)) !== 0) days.push(DAY_LABELS[i]);
  }
  return days.join(' ');
}

function describeRange(from: string | null, to: string | null): string {
  if (!from && !to) return 'Sin límite';
  return `${from ?? '—'} → ${to ?? '—'}`;
}

function hhmm(s: string): string {
  return s.slice(0, 5);
}

function TypeBadge({ type }: { type: Promotion['type'] }) {
  const cfg = {
    PERCENT_OFF: { label: '% off', cls: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    FIXED_OFF: { label: '$ off', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    BOGO: { label: 'BOGO', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
    COMBO_OFF: { label: 'Combo', cls: 'bg-purple-50 text-purple-700 ring-purple-600/20' },
  }[type];
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

function Badge({ children, tone }: { children: React.ReactNode; tone: 'success' | 'muted' }) {
  const cls =
    tone === 'success'
      ? 'bg-green-50 text-green-700 ring-green-600/20'
      : 'bg-gray-100 text-gray-600 ring-gray-500/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}
