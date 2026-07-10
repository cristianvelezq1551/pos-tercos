import type { Promotion } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Money,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';

interface PromotionsTableProps {
  promotions: Promotion[];
}

const TYPE_CONFIG: Record<
  Promotion['type'],
  { label: string; tone: 'primary' | 'success' | 'warning' | 'info' }
> = {
  PERCENT_OFF: { label: '% desc.', tone: 'primary' },
  FIXED_OFF: { label: '$ desc.', tone: 'success' },
  BOGO: { label: 'Lleva 2 paga 1', tone: 'warning' },
  COMBO_OFF: { label: 'Combo', tone: 'info' },
};

const CHANNEL_CONFIG: Record<
  Promotion['channel'],
  { label: string; tone: 'neutral' | 'info' | 'primary' }
> = {
  BOTH: { label: 'Caja y web', tone: 'neutral' },
  POS: { label: 'Solo caja', tone: 'primary' },
  WEB: { label: 'Solo web', tone: 'info' },
};

export function PromotionsTable({ promotions }: PromotionsTableProps) {
  const columns: DataTableColumn<Promotion>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (p) => <span className="font-medium text-foreground">{p.name}</span>,
    },
    {
      key: 'type',
      header: 'Tipo',
      cell: (p) => {
        const cfg = TYPE_CONFIG[p.type];
        return (
          <Badge tone={cfg.tone} size="sm">
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      key: 'discount',
      header: 'Descuento',
      numeric: true,
      cell: (p) => describeDiscount(p),
    },
    {
      key: 'channel',
      header: 'Canal',
      cell: (p) => {
        const cfg = CHANNEL_CONFIG[p.channel];
        return (
          <Badge tone={cfg.tone} size="sm">
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      key: 'days',
      header: 'Días',
      numeric: true,
      hideOnMobile: true,
      cell: (p) => describeDays(p.daysOfWeekMask),
    },
    {
      key: 'time',
      header: 'Horario',
      numeric: true,
      hideOnMobile: true,
      cell: (p) => `${hhmm(p.timeStart)}–${hhmm(p.timeEnd)}`,
    },
    {
      key: 'range',
      header: 'Vigencia',
      numeric: true,
      hideOnMobile: true,
      cell: (p) => describeRange(p.activeFrom, p.activeTo),
    },
    {
      key: 'products',
      header: 'Productos',
      numeric: true,
      hideOnMobile: true,
      cell: (p) => p.productIds.length,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (p) =>
        p.isActive ? (
          <Badge tone="success" size="sm">
            Activa
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Inactiva
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) => (
        <Link
          href={`/promotions/${p.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      rows={promotions}
      rowKey={(p) => p.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no creaste promociones"
          description="Las promos aplican automáticamente al cobrar la venta. 4 tipos: descuento %, descuento fijo, lleva X paga Y y combo."
          action={
            <Link href="/promotions/new">
              <Button>Crear primera promoción</Button>
            </Link>
          }
        />
      }
    />
  );
}

function describeDiscount(p: Promotion): React.ReactNode {
  switch (p.type) {
    case 'PERCENT_OFF':
      return p.discountPct !== null ? `${(p.discountPct * 100).toFixed(0)}%` : '—';
    case 'FIXED_OFF':
      return p.discountFixed !== null ? <Money amount={p.discountFixed} weight="medium" /> : '—';
    case 'BOGO':
      return `${p.bogoBuyQty ?? '?'}+${p.bogoGetQty ?? '?'}`;
    case 'COMBO_OFF': {
      if (p.discountPct !== null) return `${(p.discountPct * 100).toFixed(0)}% combo`;
      if (p.discountFixed !== null) return <><Money amount={p.discountFixed} weight="medium" /> combo</>;
      return '—';
    }
  }
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function describeDays(mask: number): string {
  if (mask === 127) return 'Todos';
  const days: string[] = [];
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
