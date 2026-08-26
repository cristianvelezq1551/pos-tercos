'use client';

import type { Stockable } from '@pos-tercos/types';
import { Badge, Button, EmptyState, Input } from '@pos-tercos/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { logError } from '../../lib/client-log';
import { fetchKitchenStock } from './api';
import { CountForm } from './CountForm';
import { portionsToShow, stockState, unregisteredHint } from './stock-state';
import { WasteModal } from './WasteModal';

const TYPE_LABEL: Record<Stockable['type'], string> = {
  INGREDIENT: 'Insumo',
  SUBPRODUCT: 'Subproducto',
  PRODUCT: 'Reventa',
};

export function InventarioView() {
  const [stock, setStock] = useState<Stockable[]>([]);
  const [tab, setTab] = useState<'stock' | 'conteo'>('stock');
  const [q, setQ] = useState('');
  const [wasting, setWasting] = useState<Stockable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchKitchenStock();
      data.sort((a, b) => a.name.localeCompare(b.name));
      setStock(data);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo cargar el stock'));
      logError('inventario', e);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? stock.filter((s) => s.name.toLowerCase().includes(needle)) : stock;
  }, [stock, q]);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Inventario</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ver stock, registrar merma y contar.</p>

      <div className="mt-4 flex gap-1.5">
        <TabBtn active={tab === 'stock'} onClick={() => setTab('stock')}>
          Stock
        </TabBtn>
        <TabBtn active={tab === 'conteo'} onClick={() => setTab('conteo')}>
          Conteo físico
        </TabBtn>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : tab === 'stock' ? (
        <>
          <div className="mt-3">
            <Input
              className="h-11"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="Nada por aquí" description="No hay stock que coincida." size="sm" className="mt-4" />
          ) : (
            <ul className="mt-3 space-y-2">
              {filtered.map((s) => (
                <li key={s.id} className="flex min-h-[4.25rem] items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium text-foreground">{s.name}</span>
                      {stockState(s) === 'unregistered' ? (
                        <Badge tone="danger">Sin cuadrar</Badge>
                      ) : stockState(s) === 'low' ? (
                        <Badge tone="warning">Bajo</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {TYPE_LABEL[s.type]} · {fmt(s.currentStock)} {s.unitStock}
                      {portionsToShow(s) !== null ? (
                        <span className="text-foreground"> · {fmt(portionsToShow(s)!)} porc.</span>
                      ) : null}
                    </p>
                    {stockState(s) === 'unregistered' ? (
                      // El cocinero no carga facturas: lo único que puede hacer
                      // con esto es contarlo. Decirle "pide más" sería mandarlo
                      // a producir sobre un número que no es real.
                      <p className="mt-1 text-xs text-destructive">{unregisteredHint(s.type)}</p>
                    ) : null}
                  </div>
                  <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setWasting(s)}>
                    Merma
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mt-4">
          <CountForm stockables={stock} onDone={() => void refresh()} />
        </div>
      )}

      <WasteModal stockable={wasting} open={wasting !== null} onClose={() => setWasting(null)} onDone={() => void refresh()} />
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

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
