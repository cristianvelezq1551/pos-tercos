'use client';

import type { WebHeroSlide } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input } from '@pos-tercos/ui';
import { useEffect, useRef, useState } from 'react';
import { createAd, listAds, replaceAdMedia, updateAd } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB (igual que el backend)

/** Alta/edición de una pieza. En alta la imagen es obligatoria; al editar es opcional. */
export function AdEditModal({
  ad,
  onClose,
  onSaved,
}: {
  ad: WebHeroSlide | null;
  onClose: () => void;
  onSaved: (ads: WebHeroSlide[]) => void;
}) {
  const isNew = ad === null;
  const [link, setLink] = useState(ad?.linkUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(ad?.mediaUrl ?? null);
  const [previewIsVideo, setPreviewIsVideo] = useState(ad?.mediaType === 'VIDEO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo los blob URLs que creamos acá (no la mediaUrl remota) deben revocarse,
  // o cada selección de archivo / cierre del modal fuga el blob anterior (hasta
  // 50 MB de video retenido en memoria del navegador).
  const objectUrlRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const pick = (f: File | null) => {
    if (f && f.size > MAX_MEDIA_BYTES) {
      setError('El archivo supera 50 MB. Usá un video más corto o más comprimido.');
      return;
    }
    setError(null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      objectUrlRef.current = url;
      setPreview(url);
    } else {
      setPreview(ad?.mediaUrl ?? null);
    }
    setPreviewIsVideo(f ? f.type.startsWith('video/') : ad?.mediaType === 'VIDEO');
  };

  const linkTrim = link.trim();
  const linkValid =
    linkTrim === '' ||
    linkTrim.startsWith('/') ||
    linkTrim.startsWith('#') ||
    /^https?:\/\//i.test(linkTrim);
  const valid = (!isNew || file) && linkValid;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const linkUrl = linkTrim === '' ? null : linkTrim;
      if (isNew) {
        await createAd({ media: file!, linkUrl: linkUrl ?? undefined });
      } else {
        await updateAd(ad.id, { linkUrl });
        if (file) await replaceAdMedia(ad.id, file);
      }
      onSaved(await listAds());
    } catch (e) {
      setError(getErrorMessage(e, 'Error guardando'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? 'Agregar publicidad' : 'Editar publicidad'}
      description="Aparece arriba de la página web del cliente, encima del menú."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-4">
          <div className="relative aspect-video w-44 shrink-0 overflow-hidden rounded-lg border border-border bg-black">
            {preview ? (
              previewIsVideo ? (
                <video
                  src={preview}
                  muted
                  loop
                  playsInline
                  autoPlay
                  className="h-full w-full object-cover"
                />
              ) : (
                <img src={preview} alt="" className="h-full w-full object-cover" />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Sin medio
              </div>
            )}
          </div>
          <div className="flex-1">
            <FormField label={isNew ? 'Imagen o video' : 'Cambiar medio (opcional)'}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
              />
            </FormField>
            <p className="mt-2 text-xs text-muted-foreground">
              Imagen (JPG, PNG, WebP) o video (MP4, WebM, máx 50 MB). El video se reproduce solo,
              sin sonido y en loop — mantenelo corto y liviano para que cargue rápido.
            </p>
          </div>
        </div>

        <FormField
          label="Link al tocar (opcional)"
          error={!linkValid ? 'Usá una URL http(s) o una ruta interna (/... o #...).' : undefined}
        >
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            maxLength={500}
            placeholder="#menu, /checkout o https://wa.me/57..."
          />
        </FormField>
        <p className="text-xs text-muted-foreground">
          Si lo dejás vacío, la pieza no es clickeable. Ejemplos: <code>#menu</code> baja al menú,
          una URL de WhatsApp abre el chat.
        </p>
      </div>
    </Dialog>
  );
}
