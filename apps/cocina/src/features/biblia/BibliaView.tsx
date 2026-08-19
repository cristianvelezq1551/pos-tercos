'use client';

import type { RecipeBookEntry } from '@pos-tercos/types';
import { EmptyState, Input } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { logError } from '../../lib/client-log';
import { fetchRecipeBook } from './api';
import { RecipeDetail } from './RecipeDetail';

type Tab = 'PRODUCT' | 'SUBPRODUCT';

export function BibliaView() {
  const [products, setProducts] = useState<RecipeBookEntry[]>([]);
  const [subproducts, setSubproducts] = useState<RecipeBookEntry[]>([]);
  const [tab, setTab] = useState<Tab>('PRODUCT');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<RecipeBookEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecipeBook()
      .then((r) => {
        setProducts(r.products);
        setSubproducts(r.subproducts);
      })
      .catch((e) => {
        setError(getErrorMessage(e, 'No se pudo cargar la biblia'));
        logError('biblia', e);
      })
      .finally(() => setLoading(false));
  }, []);

  const list = tab === 'PRODUCT' ? products : subproducts;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((e) => e.name.toLowerCase().includes(needle));
  }, [list, q]);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Biblia</h1>
      <p className="mt-1 text-sm text-muted-foreground">Cómo se prepara cada producto y subproducto.</p>

      <div className="mt-4 flex gap-1.5">
        <TabBtn active={tab === 'PRODUCT'} onClick={() => setTab('PRODUCT')}>
          Productos ({products.length})
        </TabBtn>
        <TabBtn active={tab === 'SUBPRODUCT'} onClick={() => setTab('SUBPRODUCT')}>
          Subproductos ({subproducts.length})
        </TabBtn>
      </div>

      <div className="mt-3">
        <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-4">
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nada por aquí" description="No hay recetas que coincidan." size="sm" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelected(e)}
                  className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="font-medium text-foreground">{e.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {e.preparationSteps.length > 0
                      ? `${e.preparationSteps.length} paso${e.preparationSteps.length === 1 ? '' : 's'}`
                      : 'sin pasos'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RecipeDetail entry={selected} open={selected !== null} onClose={() => setSelected(null)} />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
