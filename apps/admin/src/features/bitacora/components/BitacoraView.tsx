'use client';

import type { AuditLogEntry } from '@pos-tercos/types';
import { useCallback, useEffect, useState } from 'react';
import { listAudit } from '../../audit';
import { formatDate } from '../../../lib/format';
import { BITACORA_GROUPS, describeEvent, type EventTone } from '../lib/events';

const TONE_DOT: Record<EventTone, string> = {
  neutral: 'bg-gray-400',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
};

const TONE_TEXT: Record<EventTone, string> = {
  neutral: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

export function BitacoraView() {
  const [groupKey, setGroupKey] = useState('todo');
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const group = BITACORA_GROUPS.find((g) => g.key === groupKey) ?? BITACORA_GROUPS[0]!;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAudit({ action: group.actions.join(','), limit: 300 });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando la bitácora');
    } finally {
      setLoading(false);
    }
  }, [group]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {BITACORA_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroupKey(g.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              groupKey === g.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/40"
        >
          ↻ Refrescar
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : loading && rows.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center text-sm text-muted-foreground">
          Sin registros en esta categoría.
        </div>
      ) : (
        <ol className="overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((entry, i) => {
            const desc = describeEvent(entry);
            return (
              <li
                key={entry.id}
                className={`flex items-start gap-3 px-4 py-3 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[desc.tone]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className={`font-semibold ${TONE_TEXT[desc.tone]}`}>
                      {desc.label}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {entry.userFullName ?? entry.userEmail ?? 'Sistema'}
                    </span>
                  </p>
                  {desc.detail ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{desc.detail}</p>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDate(entry.createdAt, 'datetime')}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
