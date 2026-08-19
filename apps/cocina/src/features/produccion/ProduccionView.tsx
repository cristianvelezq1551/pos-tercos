'use client';

import type { SubproductProductionStatus } from '@pos-tercos/types';
import { Badge, Button, EmptyState, pluralizeUnit } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { logError } from '../../lib/client-log';
import { fetchProductionStatus } from './api';
import { ProduceModal } from './ProduceModal';

export function ProduccionView() {
  const [items, setItems] = useState<SubproductProductionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [producing, setProducing] = useState<SubproductProductionStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchProductionStatus();
      // "Falta producir" primero; dentro, alfabético.
      data.sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name));
      setItems(data);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo cargar la producción'));
      logError('produccion', e);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const lowCount = items.filter((i) => i.low).length;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Producción</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lowCount > 0 ? (
          <>
            <b className="text-warning">{lowCount}</b> subproducto{lowCount === 1 ? '' : 's'} por producir.
          </>
        ) : (
          'Todo con stock suficiente.'
        )}
      </p>

      <div className="mt-4">
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <EmptyState title="Sin subproductos" description="No hay subproductos activos para producir." size="sm" />
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{s.name}</span>
                    {s.low ? <Badge tone="warning">Falta producir</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Stock {fmt(s.currentStock)} {pluralizeUnit(s.unit, s.currentStock)}
                    {s.thresholdMin > 0 ? ` · mínimo ${fmt(s.thresholdMin)}` : ''}
                  </p>
                </div>
                <Button size="sm" onClick={() => setProducing(s)}>
                  Producir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProduceModal
        subproduct={producing}
        open={producing !== null}
        onClose={() => setProducing(null)}
        onProduced={() => void refresh()}
      />
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
