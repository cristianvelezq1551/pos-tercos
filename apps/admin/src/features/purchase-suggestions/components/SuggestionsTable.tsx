import type { PurchaseSuggestion } from '@pos-tercos/types';
import {
  DataTable,
  EmptyState,
  Money,
  Quantity,
  StatusBadge,
  type DataTableColumn,
  type StatusMapping,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

interface SuggestionsTableProps {
  suggestions: PurchaseSuggestion[];
}

const STATUS_MAPPING: StatusMapping<PurchaseSuggestion['status']> = {
  PENDING: { label: 'Pendiente', tone: 'warning', pulse: true },
  EVALUATED: { label: 'Evaluada', tone: 'info' },
  ACCEPTED: { label: 'Aceptada', tone: 'success' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
  STALE: { label: 'Vencida', tone: 'neutral' },
};

export function SuggestionsTable({ suggestions }: SuggestionsTableProps) {
  const columns: DataTableColumn<PurchaseSuggestion>[] = [
    {
      key: 'item',
      header: 'Insumo / producto',
      cell: (s) => (
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-foreground">{s.entityName}</span>
          <span className="text-xs text-muted-foreground">
            {s.entityType === 'INGREDIENT' ? 'Insumo' : 'Producto'}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (s) => <StatusBadge status={s.status} mapping={STATUS_MAPPING} size="sm" />,
    },
    {
      key: 'stock',
      header: 'Existencias',
      align: 'right',
      numeric: true,
      cell: (s) => (
        <span>
          <span className={s.currentStock < s.thresholdMin ? 'font-semibold text-destructive' : ''}>
            <Quantity value={s.currentStock} decimals={1} className="text-current" />
          </span>
          <span className="text-xs text-muted-foreground">
            {' / '}
            <Quantity value={s.thresholdMin} decimals={1} className="text-current" />
          </span>
        </span>
      ),
    },
    {
      key: 'suggested',
      header: 'Sugerido',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (s) => <Quantity value={s.suggestedQty} unit={s.unitPurchase} decimals={0} />,
    },
    {
      key: 'estTotal',
      header: 'Costo est.',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (s) =>
        s.estTotal === null ? <span className="text-ink-400">—</span> : <Money amount={s.estTotal} />,
    },
    {
      key: 'llm',
      header: 'Evaluado',
      hideOnMobile: true,
      cell: (s) =>
        s.llmEvaluatedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <Sparkles className="h-3 w-3" strokeWidth={1.75} />
            sí
          </span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <Link
          href={`/purchase-suggestions/${s.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      rows={suggestions}
      rowKey={(s) => s.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="no-results" />}
          title="Sin sugerencias en este filtro"
          description="Cada hora el sistema revisa los insumos y productos con existencias por debajo del mínimo y crea sugerencias automáticamente. También puedes revisar manualmente cuando quieras."
        />
      }
    />
  );
}
