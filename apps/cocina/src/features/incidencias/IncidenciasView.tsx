'use client';

import {
  KITCHEN_INCIDENT_CATEGORY_LABELS,
  type KitchenIncident,
  type KitchenIncidentCategory,
} from '@pos-tercos/types';
import { Badge, Button, EmptyState } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { logError } from '../../lib/client-log';
import { createIncident, fetchIncidents } from './api';

const CATEGORIES = Object.entries(KITCHEN_INCIDENT_CATEGORY_LABELS) as [
  KitchenIncidentCategory,
  string,
][];

export function IncidenciasView() {
  const [items, setItems] = useState<KitchenIncident[]>([]);
  const [category, setCategory] = useState<KitchenIncidentCategory>('INSUMO');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // El fallo se MUESTRA: un historial vacío por caída de red no debe verse
    // igual que "sin incidencias".
    try {
      setItems(await fetchIncidents());
      setListError(null);
    } catch (e) {
      logError('incidencias', e);
      setListError(getErrorMessage(e, 'No se pudo cargar el historial'));
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const submit = async () => {
    if (note.trim().length < 3) return setError('Escribí qué pasó.');
    setPending(true);
    setError(null);
    try {
      await createIncident({ category, note: note.trim() });
      setNote('');
      await refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Incidencias</h1>
      <p className="mt-1 text-sm text-muted-foreground">Avisale al dueño de un problema en cocina.</p>

      {/* Nueva incidencia */}
      <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                category === key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Contá qué pasó…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={() => void submit()} disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar incidencia'}
        </Button>
      </div>

      {/* Listado */}
      <div className="mt-6">
        <h2 className="caps mb-2 text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground">
          Historial
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : listError ? (
          <p role="alert" className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning">
            {listError}
          </p>
        ) : items.length === 0 ? (
          <EmptyState title="Sin incidencias" description="Cuando registres una aparece acá." size="sm" />
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={i.resolvedAt ? 'success' : 'warning'}>
                    {i.resolvedAt ? 'Resuelta' : 'Abierta'}
                  </Badge>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {KITCHEN_INCIDENT_CATEGORY_LABELS[i.category]} ·{' '}
                    {new Date(i.createdAt).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-foreground">{i.note}</p>
                {i.authorName ? <p className="mt-1 text-[0.6875rem] text-muted-foreground">— {i.authorName}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
