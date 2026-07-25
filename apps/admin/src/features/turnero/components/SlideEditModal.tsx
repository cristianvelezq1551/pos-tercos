'use client';

import type { DisplaySlide } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, Textarea } from '@pos-tercos/ui';
import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import {
  createSlide,
  listSlides,
  replaceSlideImage,
  updateSlide,
} from '../api/client';

/** Alta/edición de un slide. En alta la foto es obligatoria; al editar es opcional. */
export function SlideEditModal({
  slide,
  onClose,
  onSaved,
}: {
  slide: DisplaySlide | null;
  onClose: () => void;
  onSaved: (slides: DisplaySlide[]) => void;
}) {
  const isNew = slide === null;
  const [name, setName] = useState(slide?.name ?? '');
  const [tag, setTag] = useState(slide?.tag ?? '');
  const [price, setPrice] = useState(slide?.price ?? '');
  const [description, setDescription] = useState(slide?.description ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(slide?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blob URL del preview: se revoca al re-elegir foto y al desmontar (sin
  // esto, cada selección filtraba un blob en memoria).
  const blobUrlRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    [],
  );

  const pick = (f: File | null) => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setFile(f);
    const url = f ? URL.createObjectURL(f) : null;
    blobUrlRef.current = url;
    setPreview(url ?? slide?.imageUrl ?? null);
  };

  const valid =
    name.trim() && tag.trim() && price.trim() && description.trim() && (!isNew || file);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        await createSlide({ name, tag, price, description, image: file! });
      } else {
        await updateSlide(slide.id, { name, tag, price, description });
        if (file) await replaceSlideImage(slide.id, file);
      }
      onSaved(await listSlides());
    } catch (e) {
      setError(getErrorMessage(e, 'Error guardando'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? 'Agregar producto al turnero' : 'Editar producto'}
      description="Lo que escribís acá es lo que se ve en la pantalla del local."
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
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Sin foto
              </div>
            )}
          </div>
          <div className="flex-1">
            <FormField label={isNew ? 'Foto del producto' : 'Cambiar foto (opcional)'}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
              />
            </FormField>
            <p className="mt-2 text-xs text-muted-foreground">
              JPG, PNG o WebP. Se recorta a formato apaisado en la pantalla.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Doble Smash" />
          </FormField>
          <FormField label="Categoría (pastilla)">
            <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={30} placeholder="Burgers" />
          </FormField>
        </div>
        <FormField label="Precio (texto de vitrina)">
          <Input value={price} onChange={(e) => setPrice(e.target.value)} maxLength={20} placeholder="$29K" />
        </FormField>
        <FormField label="Descripción">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={3} placeholder="Doble carne smash, cheddar, tocineta…" />
        </FormField>
      </div>
    </Dialog>
  );
}
