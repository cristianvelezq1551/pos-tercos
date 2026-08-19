'use client';

import type { DisplaySlide, DisplayTrack } from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { listSlides, listTracks } from '../api/client';
import { SlidesPanel } from './SlidesPanel';
import { TracksPanel } from './TracksPanel';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Pantalla del dueño para administrar el turnero: qué productos/fotos/precios
 * se muestran en el B-roll y la música ambiente. Antes todo estaba hardcodeado
 * en el frontend; ahora se setea acá sin tocar código ni redeploy.
 */
export function TurneroManager() {
  const [slides, setSlides] = useState<DisplaySlide[] | null>(null);
  const [tracks, setTracks] = useState<DisplayTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listSlides(), listTracks()])
      .then(([s, t]) => {
        setSlides(s);
        setTracks(t);
      })
      .catch((e) => setError(getErrorMessage(e, 'Error cargando')));
  }, []);

  return (
    <div className="space-y-12">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <SlidesPanel slides={slides} onChange={setSlides} />
      <TracksPanel tracks={tracks} onChange={setTracks} />
    </div>
  );
}
