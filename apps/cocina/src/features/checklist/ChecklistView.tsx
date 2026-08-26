'use client';

import type { ChecklistDay, ChecklistDayItem, ChecklistType } from '@pos-tercos/types';
import { Button, EmptyState } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { logError } from '../../lib/client-log';
import { ChecklistTaskRow } from './ChecklistTaskRow';
import { completeChecklist, fetchChecklist, markChecklistItem } from './api';

export function ChecklistView() {
  const [type, setType] = useState<ChecklistType>('OPEN');
  const [data, setData] = useState<ChecklistDay | null>(null);
  const [busyItems, setBusyItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: ChecklistType) => {
    setLoading(true);
    try {
      setData(await fetchChecklist(t));
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

  /** Cada casilla se guarda al toque. Si el guardado falla, la casilla vuelve
   *  a como estaba: dejarla marcada mentiría sobre lo que quedó registrado. */
  const toggle = async (item: ChecklistDayItem) => {
    if (!data || busyItems.has(item.itemId)) return;
    const snapshot = data;
    const done = !item.done;
    setBusyItems((prev) => new Set(prev).add(item.itemId));
    setData({
      ...data,
      items: data.items.map((i) => (i.itemId === item.itemId ? { ...i, done } : i)),
      doneCount: data.doneCount + (done ? 1 : -1),
    });
    try {
      setData(await markChecklistItem({ type, itemId: item.itemId, done }));
      setError(null);
    } catch (e) {
      setData(snapshot);
      setError(getErrorMessage(e, 'No se pudo guardar. Revisa la conexión.'));
      logError('checklist-mark', e);
    } finally {
      setBusyItems((prev) => {
        const next = new Set(prev);
        next.delete(item.itemId);
        return next;
      });
    }
  };

  const submit = async () => {
    if (!data || pending) return;
    setPending(true);
    setError(null);
    try {
      setData(await completeChecklist({ type }));
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo cerrar la rutina'));
    } finally {
      setPending(false);
    }
  };

  const allDone = !!data && data.totalCount > 0 && data.doneCount === data.totalCount;

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Checklist</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tareas de apertura y cierre de cocina. Cada una se guarda al marcarla.
      </p>

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
      ) : null}

      {loading || !data ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : data.items.length === 0 ? (
        <EmptyState
          title="Sin tareas configuradas"
          description="El admin todavía no cargó las tareas de esta rutina."
          size="sm"
          className="mt-4"
        />
      ) : (
        <>
          {data.completedAt ? (
            <p className="mt-4 rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
              Rutina cerrada hoy{data.completedByName ? ` por ${data.completedByName}` : ''}.
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              <b className="text-foreground">{data.doneCount}</b> de {data.totalCount} hechas.
            </p>
          )}

          <ul className="mt-3 space-y-1.5">
            {data.items.map((item) => (
              <ChecklistTaskRow
                key={item.itemId}
                item={item}
                busy={busyItems.has(item.itemId)}
                onToggle={() => void toggle(item)}
              />
            ))}
          </ul>

          {data.completedAt ? null : (
            <Button className="min-h-11 mt-4 w-full" disabled={!allDone || pending} onClick={() => void submit()}>
              {pending ? 'Cerrando…' : 'Cerrar rutina'}
            </Button>
          )}
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
      className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/40'
      }`}
    >
      {children}
    </button>
  );
}
