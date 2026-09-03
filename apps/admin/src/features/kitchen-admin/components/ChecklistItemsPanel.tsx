'use client';

import type { ChecklistItem, ChecklistType } from '@pos-tercos/types';
import { Button, Input } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { createChecklistItem, listChecklistItems, updateChecklistItem } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

export function ChecklistItemsPanel() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [type, setType] = useState<ChecklistType>('OPEN');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // El fallo se MUESTRA: "Sin tareas" por caída de red confunde al dueño.
    try {
      setItems(await listChecklistItems());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudieron cargar las tareas'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    if (label.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      await createChecklistItem({ type, label: label.trim(), sortOrder: items.filter((i) => i.type === type).length });
      setLabel('');
      await refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo crear la tarea'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: ChecklistItem) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateChecklistItem(item.id, { isActive: !item.isActive });
      await refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo actualizar la tarea'));
    } finally {
      setBusy(false);
    }
  };

  const forType = (t: ChecklistType) => items.filter((i) => i.type === t);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 font-display text-lg font-bold text-foreground">Checklist de cocina</h2>

      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
          {error}
        </p>
      ) : null}

      {/* Alta */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ChecklistType)}
          className="h-10 rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground"
        >
          <option value="OPEN">Apertura</option>
          <option value="CLOSE">Cierre</option>
        </select>
        <Input
          className="min-w-[200px] flex-1"
          placeholder="Nueva tarea…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button onClick={() => void add()} disabled={busy || label.trim().length < 2}>
          Agregar
        </Button>
      </div>

      {(['OPEN', 'CLOSE'] as ChecklistType[]).map((t) => (
        <div key={t} className="mb-3">
          <h3 className="caps mb-1 text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground">
            {t === 'OPEN' ? 'Apertura' : 'Cierre'}
          </h3>
          {forType(t).length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin tareas.</p>
          ) : (
            <ul className="space-y-1">
              {forType(t).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span className={item.isActive ? 'text-foreground' : 'text-muted-foreground line-through'}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggle(item)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {item.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
