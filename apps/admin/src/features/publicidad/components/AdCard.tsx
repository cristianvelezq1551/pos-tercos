'use client';

import type { WebHeroSlide } from '@pos-tercos/types';
import { Badge, IconButton, Switch } from '@pos-tercos/ui';
import { ChevronDown, ChevronUp, Link2, Pencil, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { logError } from '../../../lib/client-log';
import { deleteAd, listAds, updateAd } from '../api/client';

/** Una pieza de publicidad: miniatura + link + activar/orden/editar/borrar. */
export function AdCard({
  ad,
  first,
  last,
  onEdit,
  onMove,
  onChanged,
  allAds,
}: {
  ad: WebHeroSlide;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onChanged: (ads: WebHeroSlide[]) => void;
  allAds: WebHeroSlide[];
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const updated = await updateAd(ad.id, { isActive: !ad.isActive });
      onChanged(allAds.map((a) => (a.id === ad.id ? updated : a)));
    } catch (e) {
      logError('publicidad.toggle', e, { adId: ad.id });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('¿Quitar esta publicidad de la web?')) return;
    setBusy(true);
    try {
      await deleteAd(ad.id);
      onChanged(await listAds());
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video overflow-hidden bg-black">
        {ad.mediaType === 'VIDEO' ? (
          <video
            src={ad.mediaUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={`h-full w-full object-cover transition-opacity ${ad.isActive ? '' : 'opacity-30'}`}
          />
        ) : (
          <img
            src={ad.mediaUrl}
            alt=""
            className={`h-full w-full object-cover transition-opacity ${ad.isActive ? '' : 'opacity-30'}`}
          />
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {ad.mediaType === 'VIDEO' ? (
            <Badge tone="neutral" size="sm">
              <Video className="h-3 w-3" /> Video
            </Badge>
          ) : null}
          {ad.linkUrl ? (
            <Badge tone="neutral" size="sm">
              <Link2 className="h-3 w-3" /> Con link
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-3">
        <p className="truncate text-xs text-muted-foreground">
          {ad.linkUrl ? ad.linkUrl : 'Sin link (no clicable)'}
        </p>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={ad.isActive} onChange={() => void toggle()} disabled={busy} />
            {ad.isActive ? 'Visible' : 'Oculto'}
          </label>

          <div className="flex items-center gap-1">
            <IconButton aria-label="Subir" onClick={() => onMove(ad.id, -1)} disabled={first || busy} size="sm" variant="ghost">
              <ChevronUp className="h-4 w-4" />
            </IconButton>
            <IconButton aria-label="Bajar" onClick={() => onMove(ad.id, 1)} disabled={last || busy} size="sm" variant="ghost">
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
