'use client';

import {
  KITCHEN_INCIDENT_CATEGORY_LABELS,
  type KitchenIncident,
} from '@pos-tercos/types';
import { Badge, Button } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { listIncidents, resolveIncident } from '../api/client';

export function IncidentsPanel() {
  const [items, setItems] = useState<KitchenIncident[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // El error se MUESTRA: "Sin incidencias" por un fallo de red haría creer
    // al dueño que no hay nada cuando en realidad no cargó.
    try {
      setItems(await listIncidents(onlyOpen));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las incidencias');
    }
  }, [onlyOpen]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolve = async (id: string) => {
    setBusy(id);
    try {
      await resolveIncident(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo resolver la incidencia');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">Incidencias de cocina</h2>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Solo abiertas
        </label>
      </div>
      {error ? (
        <p role="alert" className="mb-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {error ? 'No se pudieron cargar.' : 'Sin incidencias.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={i.resolvedAt ? 'success' : 'warning'}>
                  {i.resolvedAt ? 'Resuelta' : 'Abierta'}
                </Badge>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {KITCHEN_INCIDENT_CATEGORY_LABELS[i.category]} ·{' '}
                  {new Date(i.createdAt).toLocaleString('es-CO', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {i.authorName ? ` · ${i.authorName}` : ''}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-foreground">{i.note}</p>
              {!i.resolvedAt ? (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => void resolve(i.id)}>
                    {busy === i.id ? '…' : 'Marcar resuelta'}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
