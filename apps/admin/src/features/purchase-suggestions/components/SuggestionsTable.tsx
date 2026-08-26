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

const ENTITY_LABELS: Record<PurchaseSuggestion['entityType'], string> = {
  INGREDIENT: 'Insumo',
  PRODUCT: 'Producto',
  SUBPRODUCT: 'Preparación',
};

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
            {ENTITY_LABELS[s.entityType]}
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
      header: 'Existencias / mínimo',
      align: 'right',
      numeric: true,
      cell: (s) => (
        <span className="inline-flex flex-col items-end">
          <span>
            <span className={s.currentStock < s.thresholdMin ? 'font-semibold text-destructive' : ''}>
              <Quantity value={s.currentStock} maxDecimals={1} className="text-current" />
            </span>
            <span className="text-xs text-muted-foreground">
              {' / '}
              <Quantity value={s.thresholdMin} maxDecimals={1} className="text-current" />
              {` ${s.unitStock}`}
            </span>
          </span>
          {s.currentStock < s.thresholdMin ? (
            <span className="text-xs text-muted-foreground">
              faltan{' '}
              <Quantity
                value={s.thresholdMin - s.currentStock}
                unit={s.unitStock}
                maxDecimals={1}
                className="text-current"
              />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'suggested',
      header: 'Comprar',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (s) => (
        <span className="inline-flex flex-col items-end">
          <Quantity value={s.suggestedQty} unit={s.unitPurchase} maxDecimals={2} />
          {s.conversionFactor !== 1 || s.unitPurchase !== s.unitStock ? (
            <span className="text-xs text-muted-foreground">
              ={' '}
              <Quantity
                value={s.suggestedQty * s.conversionFactor}
                unit={s.unitStock}
                maxDecimals={1}
                className="text-current"
              />
            </span>
          ) : null}
        </span>
      ),
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
