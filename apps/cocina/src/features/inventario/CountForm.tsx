'use client';

import type { Stockable } from '@pos-tercos/types';
import { Button, Input } from '@pos-tercos/ui';
import { useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { registerCount, stockableRef } from './api';

/**
 * Conteo físico CIEGO: el cocinero ingresa lo que cuenta SIN ver el stock
 * esperado (no se muestra acá a propósito). Solo se envían los ítems con valor.
 */
export function CountForm({ stockables, onDone }: { stockables: Stockable[]; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ counted: number; adjusted: number } | null>(null);

  const filledCount = Object.values(values).filter((v) => v.trim() !== '').length;

  const submit = async () => {
    const items = stockables
      .filter((s) => values[s.id]?.trim() !== '' && values[s.id] !== undefined)
      .map((s) => ({ ...stockableRef(s), countedQty: Number(values[s.id]) }))
      .filter((i) => Number.isFinite(i.countedQty) && i.countedQty >= 0);
    if (items.length === 0) return setError('Contá al menos un ítem.');
    setPending(true);
    setError(null);
    try {
      const r = await registerCount({ items });
      setResult(r);
      setValues({});
      onDone();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar el conteo'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Conteo a ciegas: contá lo que hay y escribí la cantidad. El administrador revisa y aprueba tu
        conteo antes de que ajuste el inventario — no te mostramos lo esperado.
      </p>

      {result ? (
        <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
          Enviado: {result.counted} ítem(s) contados. Queda pendiente de aprobación del administrador.
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {stockables.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 bg-card px-3 py-2">
            <span className="min-w-0 truncate text-sm text-foreground">
              {s.name} <span className="text-xs text-muted-foreground">({s.unitStock})</span>
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="w-24 shrink-0"
              placeholder="—"
              value={values[s.id] ?? ''}
              onChange={(e) => setValues((p) => ({ ...p, [s.id]: e.target.value }))}
            />
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button className="w-full" disabled={pending || filledCount === 0} onClick={() => void submit()}>
        {pending ? 'Registrando…' : `Registrar conteo (${filledCount})`}
      </Button>
    </div>
  );
}
