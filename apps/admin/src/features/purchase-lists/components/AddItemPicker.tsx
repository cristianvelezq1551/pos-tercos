'use client';

import type { ShortageCandidate } from '@pos-tercos/types';
import { Button, Input, Quantity } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { listCandidates } from '../api';

interface Props {
  /** Ítems que ya están en la lista: no se vuelven a ofrecer. */
  yaEnLista: ReadonlySet<string>;
  onAdd: (c: ShortageCandidate) => Promise<void>;
  disabled?: boolean;
}

/**
 * Buscador para agregar un insumo a la lista. Muestra existencias y mínimo de
 * cada candidato: elegir cuánto pedir sin ver cuánto hay es adivinar.
 *
 * Arranca mostrando SOLO lo que está bajo el mínimo, que es el 90% de los
 * casos; el resto del catálogo aparece al buscar o al pedirlo, para cuando se
 * quiere adelantar una compra de algo que todavía no bajó.
 */
export function AddItemPicker({ yaEnLista, onAdd, disabled }: Props) {
  const [all, setAll] = useState<ShortageCandidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCandidates(false)
      .then((res) => {
        if (!cancelled) setAll(res);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'No se pudo cargar el inventario.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibles = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    return all
      .filter((c) => !yaEnLista.has(`${c.entityType}:${c.entityId}`))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : verTodos || c.belowMinimum))
      .slice(0, 40);
  }, [all, query, verTodos, yaEnLista]);

  const bajoMinimoRestantes = useMemo(
    () =>
      (all ?? []).filter(
        (c) => c.belowMinimum && !yaEnLista.has(`${c.entityType}:${c.entityId}`),
      ).length,
    [all, yaEnLista],
  );

  async function handleAdd(c: ShortageCandidate) {
    setAdding(`${c.entityType}:${c.entityId}`);
    setError(null);
    try {
      await onAdd(c);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo agregar.'));
    }
    setAdding(null);
  }

  if (!all) return <p className="text-sm text-muted-foreground">Cargando inventario…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar un insumo o producto…"
          className="max-w-xs"
          disabled={disabled}
        />
        {!query.trim() ? (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            disabled={disabled}
          >
            {verTodos
              ? `Ver solo lo que falta (${bajoMinimoRestantes})`
              : 'Ver todo el inventario'}
          </Button>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {query.trim()
            ? 'Nada con ese nombre fuera de la lista.'
            : bajoMinimoRestantes === 0
              ? 'Todo lo que está bajo el mínimo ya está en la lista. Busca por nombre para agregar algo más.'
              : 'Sin resultados.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {visibles.map((c) => {
            const key = `${c.entityType}:${c.entityId}`;
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    hay{' '}
                    <Quantity
                      value={c.currentStock}
                      maxDecimals={1}
                      className={c.belowMinimum ? 'text-destructive' : 'text-current'}
                    />
                    {' / '}
                    <Quantity value={c.thresholdMin} unit={c.unitStock} maxDecimals={1} className="text-current" />
                    {c.belowMinimum ? (
                      <>
                        {' · faltan '}
                        <Quantity value={c.deficitStock} unit={c.unitStock} maxDecimals={1} className="text-current" />
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  sugerido{' '}
                  <Quantity value={c.suggestedQty} unit={c.unitPurchase} maxDecimals={2} className="text-current" />
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => void handleAdd(c)}
                  disabled={disabled || adding !== null}
                >
                  {adding === key ? 'Agregando…' : 'Agregar'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
