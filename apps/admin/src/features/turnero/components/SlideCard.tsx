'use client';

import type { DisplaySlide } from '@pos-tercos/types';
import { Badge, IconButton, Switch } from '@pos-tercos/ui';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { deleteSlide, listSlides, updateSlide } from '../api/client';

/** Una tarjeta de slide: miniatura + datos + activar/orden/editar/borrar. */
export function SlideCard({
  slide,
  first,
  last,
  onEdit,
  onMove,
  onChanged,
  allSlides,
}: {
  slide: DisplaySlide;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onChanged: (s: DisplaySlide[]) => void;
  allSlides: DisplaySlide[];
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const updated = await updateSlide(slide.id, { isActive: !slide.isActive });
      onChanged(allSlides.map((s) => (s.id === slide.id ? updated : s)));
    } catch {
      /* el error global lo cubre el panel; acá no rompemos la grilla */
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Quitar "${slide.name}" del turnero?`)) return;
    setBusy(true);
    try {
      await deleteSlide(slide.id);
      onChanged(await listSlides());
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video overflow-hidden bg-black">
        <img
          src={slide.imageUrl}
          alt={slide.name}
          className={`h-full w-full object-cover transition-opacity ${slide.isActive ? '' : 'opacity-30'}`}
        />
        <div className="absolute left-2 top-2">
          <Badge tone="danger" size="sm">
            {slide.tag}
          </Badge>
        </div>
        <div className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-sm font-bold text-white tabular-nums">
          {slide.price}
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <p className="font-semibold text-foreground">{slide.name}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{slide.description}</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={slide.isActive} onChange={() => void toggle()} disabled={busy} />
            {slide.isActive ? 'Visible' : 'Oculto'}
          </label>

          <div className="flex items-center gap-1">
            <IconButton aria-label="Subir" onClick={() => onMove(slide.id, -1)} disabled={first || busy} size="sm" variant="ghost">
              <ChevronUp className="h-4 w-4" />
            </IconButton>
            <IconButton aria-label="Bajar" onClick={() => onMove(slide.id, 1)} disabled={last || busy} size="sm" variant="ghost">
              <ChevronDown className="h-4 w-4" />
            </IconButton>
            <IconButton aria-label="Editar" onClick={onEdit} disabled={busy} size="sm" variant="ghost">
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton aria-label="Quitar" onClick={remove} disabled={busy} size="sm" variant="ghost">
              <Trash2 className="h-4 w-4 text-destructive" />
            </IconButton>
          </div>
        </div>
      </div>
    </article>
  );
}
