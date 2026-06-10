'use client';

import { useState } from 'react';
import type { AuditLogEntry } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  formatDate,
  type BadgeTone,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { actionLabel } from '../lib/action-labels';
import { describeAuditDetail } from '../lib/describe-detail';

interface AuditTableProps {
  rows: AuditLogEntry[];
}

/** Hay algo que mostrar si trae metadata útil o cambios antes/después. */
function hasUsefulDetail(entry: AuditLogEntry): boolean {
  const meta = entry.metadata as unknown;
  const metaUseful =
    meta !== null &&
    meta !== undefined &&
    (typeof meta !== 'object' || Object.keys(meta as Record<string, unknown>).length > 0);
  return metaUseful || entry.beforeJson !== null || entry.afterJson !== null;
}

export function AuditTable({ rows }: AuditTableProps) {
  const [openEntry, setOpenEntry] = useState<AuditLogEntry | null>(null);

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: (entry) => (
        <time className="tabular text-xs text-muted-foreground" dateTime={entry.createdAt}>
          {formatDate(entry.createdAt, 'datetime')}
        </time>
      ),
    },
    {
      key: 'action',
      header: 'Acción',
      cell: (entry) => (
        <Badge tone={toneFor(entry.action)} size="sm" title={entry.action}>
          {actionLabel(entry.action)}
        </Badge>
      ),
    },
    {
      key: 'user',
      header: 'Usuario',
      cell: (entry) =>
        entry.userEmail ? (
          <div className="flex flex-col leading-tight">
            <span className="font-medium text-foreground">
              {entry.userFullName ?? entry.userEmail}
            </span>
            <span className="text-xs text-muted-foreground">{entry.userEmail}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">(sin usuario)</span>
        ),
    },
    {
      key: 'entity',
      header: 'Entidad',
      hideOnMobile: true,
      cell: (entry) =>
        entry.entityType ? (
          <div className="flex flex-col leading-tight">
            <span className="caps text-[0.625rem] text-muted-foreground">{entry.entityType}</span>
            {entry.entityId ? (
              <span className="font-mono text-xs text-foreground">
                {entry.entityId.slice(0, 8)}…
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'detail',
      header: 'Detalle',
      cell: (entry) => {
        if (!hasUsefulDetail(entry)) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <button
            type="button"
            onClick={() => setOpenEntry(entry)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Ver detalle
          </button>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(entry) => entry.id}
        columns={columns}
        emptyState={
          <EmptyState
            illustration={<LineArtIllustration name="empty-plate" />}
            title="No hay entradas de auditoría todavía"
          />
        }
      />
      {openEntry ? (
        <Dialog
          open
          onClose={() => setOpenEntry(null)}
          title={actionLabel(openEntry.action)}
          description={`${formatDate(openEntry.createdAt, 'datetime')} · ${openEntry.action}`}
          maxWidth="max-w-2xl"
          footer={
            <Button variant="outline" onClick={() => setOpenEntry(null)}>
              Cerrar
            </Button>
          }
        >
          <DetailBody entry={openEntry} />
        </Dialog>
      ) : null}
    </>
  );
}

function DetailBody({ entry }: { entry: AuditLogEntry }) {
  const { summary, facts } = describeAuditDetail(entry);
  const hasRawJson =
    entry.beforeJson !== null ||
    entry.afterJson !== null ||
    (entry.metadata !== null && entry.metadata !== undefined);

  return (
    <div className="space-y-5 text-sm">
      {summary ? (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-foreground">{summary}</p>
      ) : null}

      <div className="space-y-2">
        <FactRow label="Quién">
          {entry.userEmail ? (
            <span>
              <span className="font-medium text-foreground">
                {entry.userFullName ?? entry.userEmail}
              </span>{' '}
              <span className="text-muted-foreground">· {entry.userEmail}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">(sin usuario)</span>
          )}
        </FactRow>
        {entry.entityType ? (
          <FactRow label="Sobre">
            <span className="text-foreground">{entry.entityType}</span>
            {entry.entityId ? (
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                {entry.entityId.slice(0, 8)}…
              </span>
            ) : null}
          </FactRow>
        ) : null}
        {facts.map((f) => (
          <FactRow key={f.label} label={f.label}>
            <span className="text-foreground">{f.value}</span>
          </FactRow>
        ))}
      </div>

      {hasRawJson ? (
        <details className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            Datos técnicos (JSON)
          </summary>
          <div className="mt-2 space-y-3">
            <RawJson label="Metadata" value={entry.metadata} />
            <RawJson label="Antes" value={entry.beforeJson} />
            <RawJson label="Después" value={entry.afterJson} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="caps text-[0.625rem] text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function RawJson({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0) {
    return null;
  }
  return (
    <div>
      <p className="caps mb-1 text-[0.625rem] text-muted-foreground">{label}</p>
      <pre className="max-h-80 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed text-foreground">
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
