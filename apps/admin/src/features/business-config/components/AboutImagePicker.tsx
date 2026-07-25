'use client';

import type { BusinessConfig } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { uploadAboutImage } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Foto de "Nosotros". Sube al toque (no espera al Guardar de la sección): son
 * bytes, no un campo de texto — y así el dueño ve el resultado enseguida.
 */
export function AboutImagePicker({
  imageUrl,
  onSaved,
}: {
  imageUrl: string | null;
  onSaved: (c: BusinessConfig) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cache-buster: la URL es fija (/api/web-hero/about-image) y sin esto el
  // browser seguiría mostrando la foto vieja tras reemplazarla.
  const [version, setVersion] = useState(0);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await uploadAboutImage(file));
      setVersion((v) => v + 1);
    } catch (e) {
      logError('web-config.about-image', e);
      setError(getErrorMessage(e, 'No se pudo subir la foto.'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Foto</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-28 w-44 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {imageUrl ? (
            <img
              src={version ? `${imageUrl}?v=${version}` : imageUrl}
              alt="Foto de Nosotros"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              Sin foto
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {imageUrl ? 'Cambiar foto' : 'Subir foto'}
          </Button>
          <p className="max-w-xs text-xs text-muted-foreground">
            Va al lado de la historia. Elegí una <strong>horizontal</strong> — ese espacio es
            ancho. Sin foto, la web usa su fondo degradado.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
