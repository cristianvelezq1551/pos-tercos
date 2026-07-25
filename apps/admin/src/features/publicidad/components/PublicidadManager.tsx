'use client';

import type { WebHeroSlide } from '@pos-tercos/types';
import { Button, EmptyState } from '@pos-tercos/ui';
import { ImagePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { listAds, reorderAds } from '../api/client';
import { AdCard } from './AdCard';
import { AdEditModal } from './AdEditModal';
import { getErrorMessage } from '../../../lib/errors';

/** Administra la publicidad del storefront: grilla de piezas + alta + orden. */
export function PublicidadManager() {
  const [ads, setAds] = useState<WebHeroSlide[] | null>(null);
  const [editing, setEditing] = useState<WebHeroSlide | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAds()
      .then(setAds)
      .catch((e) => {
        setError(getErrorMessage(e, 'Error cargando'));
        setAds([]);
      });
  }, []);

  const move = async (id: string, dir: -1 | 1) => {
    if (!ads) return;
    const i = ads.findIndex((a) => a.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ads.length) return;
    const next = [...ads];
    [next[i], next[j]] = [next[j], next[i]];
    setAds(next); // optimista
    try {
      setAds(await reorderAds(next.map((a) => a.id)));
    } catch (e) {
      logError('publicidad.reorder', e);
      setAds(ads);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Piezas de publicidad</h2>
          <p className="text-sm text-muted-foreground">
            Rotan en la parte superior de la página web del cliente, encima del menú. El orden de
            aquí es el orden en que aparecen.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <ImagePlus className="h-4 w-4" /> Agregar publicidad
        </Button>
      </header>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {ads && ads.length === 0 ? (
        <EmptyState
          title="Todavía no hay publicidad configurada"
          description="Mientras no agregues piezas, la web muestra su portada por defecto. Agrega una imagen para que aparezca arriba del menú."
          action={<Button onClick={() => setEditing('new')}>Agregar publicidad</Button>}
        />
      ) : null}

      {ads && ads.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ads.map((a, i) => (
            <AdCard
              key={a.id}
              ad={a}
              first={i === 0}
              last={i === ads.length - 1}
              onEdit={() => setEditing(a)}
              onMove={move}
              onChanged={setAds}
              allAds={ads}
            />
          ))}
        </div>
      ) : null}

      {!ads && !error ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}

      {editing ? (
        <AdEditModal
          ad={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setAds(next);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
