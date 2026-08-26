import type { PurchaseListSummary } from '@pos-tercos/types';
import { PURCHASE_LIST_STATUS_LABELS } from '@pos-tercos/types';
import {
  DataTable,
  EmptyState,
  Money,
  StatusBadge,
  type DataTableColumn,
  type StatusMapping,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

const STATUS_MAPPING: StatusMapping<PurchaseListSummary['status']> = {
  DRAFT: { label: PURCHASE_LIST_STATUS_LABELS.DRAFT, tone: 'warning' },
  CLOSED: { label: PURCHASE_LIST_STATUS_LABELS.CLOSED, tone: 'neutral' },
};

export function PurchaseListsTable({ lists }: { lists: PurchaseListSummary[] }) {
  const columns: DataTableColumn<PurchaseListSummary>[] = [
    {
      key: 'title',
      header: 'Lista',
      cell: (l) => (
        <span>
          <span className="font-medium text-foreground">{l.title ?? 'Sin nombre'}</span>
          <span className="block text-xs text-muted-foreground">
            {l.createdByName} · {new Date(l.createdAt).toLocaleDateString('es-CO')}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (l) => <StatusBadge status={l.status} mapping={STATUS_MAPPING} size="sm" />,
    },
    {
      key: 'items',
      header: 'Ítems',
      align: 'right',
      numeric: true,
      cell: (l) => <span className="tabular-nums">{l.itemCount}</span>,
    },
    {
      key: 'total',
      header: 'Costo est.',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (l) => (
        <span>
          <Money amount={l.estTotal} />
          {l.itemsWithoutCost > 0 ? (
            <span
              className="block text-xs text-warning"
              title={`${l.itemsWithoutCost} sin costo conocido`}
            >
              incompleto
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'ai',
      header: 'Revisada',
      hideOnMobile: true,
      cell: (l) =>
        l.evaluatedByAi ? (
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
      cell: (l) => (
        <Link
          href={`/purchase-lists/${l.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Abrir
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      rows={lists}
      rowKey={(l) => l.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="no-results" />}
          title="Todavía no has armado ninguna lista"
          description="Una lista de faltantes es la hoja con la que sales a comprar: eliges qué te falta, cuánto pedir de cada cosa, y la imprimes completa o partida por proveedor."
        />
      }
    />
  );
}
