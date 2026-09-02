'use client';

import type { PrepImage } from '@pos-tercos/types';
import { MAX_PREP_IMAGES } from '@pos-tercos/types';
import { Button, Input, Label } from '@pos-tercos/ui';
import { useRef, useState } from 'react';
import { getErrorMessage } from '../lib/errors';
import { subirImagen } from '../lib/subir-imagen';

/**
 * Fotos de la preparación para la biblia de cocina.
 *
 * Son varias a propósito: un plato se arma distinto según la variante y con una
 * sola foto no hay cómo mostrarlo. El rótulo de cada una es lo que las
 * distingue — dos fotos sin nombre no le dicen al cocinero cuál es cuál.
 */
export function PrepImagesField({
  images,
  onChange,
  disabled,
  hint,
}: {
  images: PrepImage[];
  onChange: (images: PrepImage[]) => void;
  disabled?: boolean;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lleno = images.length >= MAX_PREP_IMAGES;

  const agregar = async (files: FileList) => {
    setError(null);
    setSubiendo(true);
    try {
      const cabe = Array.from(files).slice(0, MAX_PREP_IMAGES - images.length);
      const subidas = await Promise.all(cabe.map((f) => subirImagen(f)));
      onChange([...images, ...subidas.map((s) => ({ url: s.imageUrl, label: null }))]);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo subir la foto.'));
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const rotular = (i: number, label: string) => {
    onChange(images.map((img, n) => (n === i ? { ...img, label: label || null } : img)));
  };

  return (
    <div className="space-y-2">
      <Label>Fotos de la preparación (cocina)</Label>

      {images.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((img, i) => (
            <li
              key={img.url}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-2"
            >
              <img
                src={img.url}
                alt={img.label ?? `Preparación ${i + 1}`}
                className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={img.label ?? ''}
                  disabled={disabled || subiendo}
                  maxLength={60}
                  placeholder="¿Cuál variante? (ej. Doble)"
                  aria-label={`Rótulo de la foto ${i + 1}`}
                  onChange={(e) => rotular(i, e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled || subiendo}
                  onClick={() => onChange(images.filter((_, n) => n !== i))}
                >
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        disabled={disabled || subiendo || lleno}
        onClick={() => inputRef.current?.click()}
      >
        {subiendo ? 'Subiendo…' : images.length > 0 ? 'Agregar otra foto' : 'Subir foto'}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) void agregar(files);
        }}
      />

      <p className="text-xs text-muted-foreground">
        {hint} Puedes subir varias —una por variante— y ponerle nombre a cada una.
        {lleno ? ` Llegaste al máximo de ${MAX_PREP_IMAGES}.` : ''}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
