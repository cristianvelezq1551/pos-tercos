'use client';

import { useState } from 'react';
import type { AuditLogEntry } from '@pos-tercos/types';
import {
  Badge,
  DataTable,
  EmptyState,
  formatDate,
  type BadgeTone,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';

interface AuditTableProps {
  rows: AuditLogEntry[];
}

interface AuditRowState {
  entry: AuditLogEntry;
  open: boolean;
  toggle: () => void;
}

export function AuditTable({ rows }: AuditTableProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const data: AuditRowState[] = rows.map((entry) => ({
    entry,
    open: openIds.has(entry.id),
    toggle: () =>
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(entry.id)) next.delete(entry.id);
        else next.add(entry.id);
        return next;
      }),
  }));

  const columns: DataTableColumn<AuditRowState>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: ({ entry }) => (
        <time className="tabular text-xs text-muted-foreground" dateTime={entry.createdAt}>
          {formatDate(entry.createdAt, 'datetime')}
        </time>
      ),
    },
    {
      key: 'action',
      header: 'Acción',
      cell: ({ entry }) => (
        <Badge tone={toneFor(entry.action)} size="sm" className="font-mono">
          {entry.action}
        </Badge>
      ),
    },
    {
      key: 'user',
      header: 'Usuario',
      cell: ({ entry }) =>
        entry.userEmail ? (
          <div className="flex flex-col leading-tight">
            <span className="font-medium text-foreground">
              {entry.userFullName ?? entry.userEmail}
            </span>
            <span className="text-xs text-muted-foreground">{entry.userEmail}</span>
          </div>
        ) : (
          <span className="text-xs text-ink-400">(sin user)</span>
        ),
    },
    {
      key: 'entity',
      header: 'Entidad',
      hideOnMobile: true,
      cell: ({ entry }) =>
        entry.entityType ? (
          <div className="flex flex-col leading-tight">
            <span className="caps text-[0.625rem] text-muted-foreground">{entry.entityType}</span>
            {entry.entityId ? (
              <span className="font-mono text-xs text-ink-600">
                {entry.entityId.slice(0, 8)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'detail',
      header: 'Detalle',
      cell: ({ entry, open, toggle }) => {
        const hasDetails =
          entry.beforeJson !== null || entry.afterJson !== null || entry.metadata !== null;
        if (!hasDetails) return <span className="text-xs text-ink-400">—</span>;
        return (
          <button
            type="button"
            onClick={toggle}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {open ? 'Ocultar' : 'Ver detalle'}
          </button>
        );
      },
    },
  ];

  // Custom render: tras la tabla, listar los rows expandidos como bloques abajo.
  const expanded = data.filter((d) => d.open);

  return (
    <div className="space-y-3">
      <DataTable
        rows={data}
        rowKey={({ entry }) => entry.id}
        columns={columns}
        emptyState={
          <EmptyState
            illustration={<LineArtIllustration name="empty-plate" />}
            title="No hay entradas de auditoría todavía"
          />
        }
      />
      {expanded.map(({ entry }) => (
        <div
          key={`detail-${entry.id}`}
          className="rounded-xl border border-border bg-muted/30 p-4 text-sm"
        >
          <p className="caps mb-2 text-[0.625rem] text-muted-foreground">
            Detalle · {entry.action} · {formatDate(entry.createdAt, 'datetime')}
          </p>
          <DetailBlock label="Metadata" value={entry.metadata} />
          <DetailBlock label="Antes" value={entry.beforeJson} />
          <DetailBlock label="Después" value={entry.afterJson} />
        </div>
      ))}
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-card p-2 font-mono text-xs text-ink-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function toneFor(action: string): BadgeTone {
  if (action.endsWith('_FAILED') || action.endsWith('_DENIED')) return 'danger';
  if (action.startsWith('AUTH_')) return 'primary';
  if (action.startsWith('INVOICE_')) return 'info';
  if (action.startsWith('INVENTORY_')) return 'success';
  if (
    action.startsWith('PRODUCT_') ||
    action.startsWith('SUBPRODUCT_') ||
    action.startsWith('INGREDIENT_') ||
    action.startsWith('RECIPE_')
  ) {
    return 'info';
  }
  if (action.startsWith('SALE_') || action.startsWith('SHIFT_') || action.startsWith('CASH_'))
    return 'warning';
  return 'neutral';
}
