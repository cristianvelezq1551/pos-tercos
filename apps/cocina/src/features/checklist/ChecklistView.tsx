'use client';

import { Checkbox, EmptyState } from '@pos-tercos/ui';
import { Button } from '@pos-tercos/ui';
import type { ChecklistToday, ChecklistType } from '@pos-tercos/types';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { logError } from '../../lib/client-log';
import { completeChecklist, fetchChecklist } from './api';

export function ChecklistView() {
  const [type, setType] = useState<ChecklistType>('OPEN');
  const [data, setData] = useState<ChecklistToday | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: ChecklistType) => {
    setLoading(true);
    try {
      const d = await fetchChecklist(t);
      setData(d);
      // Si ya se completó hoy, dejamos todo marcado.
      setChecked(d.completedAt ? new Set(d.items.map((i) => i.id)) : new Set());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo cargar el checklist'));
      logError('checklist', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(type);
  }, [type, load]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allDone = !!data && data.items.length > 0 && data.items.every((i) => checked.has(i.id));

  const submit = async () => {
    if (!data || !allDone) return;
    setPending(true);
    setError(null);
    try {
      const updated = await completeChecklist({ type, doneItemIds: [...checked] });
      setData(updated);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo completar'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Checklist</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tareas de apertura y cierre de cocina.</p>

      <div className="mt-4 flex gap-1.5">
        <TabBtn active={type === 'OPEN'} onClick={() => setType('OPEN')}>
          Apertura
        </TabBtn>
        <TabBtn active={type === 'CLOSE'} onClick={() => setType('CLOSE')}>
          Cierre
        </TabBtn>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : loading || !data ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : data.items.length === 0 ? (
        <EmptyState
          title="Sin tareas configuradas"
          description="El admin todavía no cargó los ítems de esta rutina."
          size="sm"
          className="mt-4"
        />
      ) : (
        <>
          {data.completedAt ? (
            <p className="mt-4 rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
              Completado hoy{data.completedByName ? ` por ${data.completedByName}` : ''}.
            </p>
          ) : null}
          <ul className="mt-4 space-y-1.5">
            {data.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <Checkbox
                  checked={checked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  label={item.label}
                />
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full" disabled={!allDone || pending} onClick={() => void submit()}>
            {pending
              ? 'Guardando…'
              : data.completedAt
                ? 'Actualizar rutina'
                : 'Marcar rutina completa'}
          </Button>
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/40'
      }`}
    >
      {children}
    </button>
  );
}
