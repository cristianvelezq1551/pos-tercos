'use client';

import type { DisplayTrack } from '@pos-tercos/types';
import { Button, IconButton, Switch } from '@pos-tercos/ui';
import { Music, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { createTrack, deleteTrack, listTracks, updateTrack } from '../api/client';

const MAX_MB = 50;

/** Sección "Música ambiente": subir/activar/borrar pistas del turnero. */
export function TracksPanel({
  tracks,
  onChange,
}: {
  tracks: DisplayTrack[] | null;
  onChange: (t: DisplayTrack[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera ${MAX_MB} MB. Comprimí el MP3 o usá uno más liviano.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const label = file.name.replace(/\.[^.]+$/, '');
      await createTrack(label, file);
      onChange(await listTracks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error subiendo');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const toggle = async (t: DisplayTrack) => {
    try {
      const updated = await updateTrack(t.id, { isActive: !t.isActive });
      onChange((tracks ?? []).map((x) => (x.id === t.id ? updated : x)));
    } catch {
      /* no romper la lista por un toggle */
    }
  };

  const remove = async (t: DisplayTrack) => {
    if (!confirm(`¿Borrar la pista "${t.label}"?`)) return;
    setBusy(true);
    try {
      await deleteTrack(t.id);
      onChange(await listTracks());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Música ambiente</h2>
          <p className="text-sm text-muted-foreground">
            Suena en bucle en el local. Las pistas activas se reproducen en orden, una tras otra.
          </p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" /> Subir pista
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </header>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {tracks && tracks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
          <Music className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Sin música. El turnero funciona igual (la campana de llamado suena siempre); subí pistas
            si querés ambiente musical. Recomendado: MP3 hasta {MAX_MB} MB.
          </p>
        </div>
      ) : null}

      {tracks && tracks.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {tracks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {t.label}
              </span>
              <audio src={t.audioUrl} controls preload="none" className="h-8 w-48 max-w-[40vw]" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={t.isActive} onChange={() => void toggle(t)} disabled={busy} />
                {t.isActive ? 'Activa' : 'Off'}
              </label>
              <IconButton aria-label="Borrar" onClick={() => remove(t)} disabled={busy} size="sm" variant="ghost">
                <Trash2 className="h-4 w-4 text-destructive" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}

      {!tracks ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
    </section>
  );
}
