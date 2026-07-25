'use client';

import type { DisplaySlide } from '@pos-tercos/types';
import { Button, EmptyState } from '@pos-tercos/ui';
import { ImagePlus } from 'lucide-react';
import { useState } from 'react';
import { importDefaults, listSlides, reorderSlides } from '../api/client';
import { SlideCard } from './SlideCard';
import { SlideEditModal } from './SlideEditModal';
import { getErrorMessage } from '../../../lib/errors';

/** Sección "Productos del turnero": grilla de slides + alta + import por defecto. */
export function SlidesPanel({
  slides,
  onChange,
}: {
  slides: DisplaySlide[] | null;
  onChange: (s: DisplaySlide[]) => void;
}) {
  const [editing, setEditing] = useState<DisplaySlide | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doImport = async () => {
    setBusy(true);
    setError(null);
    try {
      await importDefaults();
      onChange(await listSlides());
    } catch (e) {
      setError(getErrorMessage(e, 'Error importando'));
    } finally {
      setBusy(false);
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    if (!slides) return;
    const i = slides.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next); // optimista
    try {
      onChange(await reorderSlides(next.map((s) => s.id)));
    } catch {
      onChange(slides);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Productos del turnero</h2>
          <p className="text-sm text-muted-foreground">
            Lo que rota en la pantalla del local. El orden de aquí es el orden en que aparecen.
          </p>
        </div>
        <Button onClick={() => setEditing('new')} disabled={busy}>
          <ImagePlus className="h-4 w-4" /> Agregar producto
        </Button>
      </header>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {slides && slides.length === 0 ? (
        <EmptyState
          title="Todavía no configuraste el turnero"
          description="Importá el contenido de ejemplo (las hamburguesas y combos de Tercos) para arrancar y editalo a tu gusto, o agregá tus propios productos."
          action={
            <Button onClick={doImport} disabled={busy}>
              {busy ? 'Importando…' : 'Importar contenido de ejemplo'}
            </Button>
          }
        />
      ) : null}

      {slides && slides.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {slides.map((s, i) => (
            <SlideCard
              key={s.id}
              slide={s}
              first={i === 0}
              last={i === slides.length - 1}
              onEdit={() => setEditing(s)}
              onMove={move}
              onChanged={onChange}
              allSlides={slides}
            />
          ))}
        </div>
      ) : null}

      {!slides ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}

      {editing ? (
        <SlideEditModal
          slide={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            onChange(next);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
