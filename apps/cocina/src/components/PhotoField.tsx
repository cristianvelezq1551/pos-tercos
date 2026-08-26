'use client';

import { Button } from '@pos-tercos/ui';
import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface PhotoFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** La merma no se registra sin foto; la incidencia sí. */
  required?: boolean;
  disabled?: boolean;
  label?: string;
}

/**
 * Selector de foto con vista previa. `capture="environment"` abre la cámara
 * trasera en el teléfono, pero deja elegir de la galería igual: si el permiso
 * de cámara está denegado en la tablet, obligar a la cámara sería dejar a la
 * cocina sin poder registrar.
 */
export function PhotoField({ file, onChange, required, disabled, label = 'Foto' }: PhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clear = () => {
    onChange(null);
    // Sin esto, volver a elegir la MISMA foto no dispara change.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="mt-1.5 flex items-center gap-3">
          {/* <img> a pelo: es un blob local que nunca pasa por el optimizador. */}
          <img
            src={preview}
            alt="Vista previa de la foto"
            className="h-20 w-20 rounded-lg border border-border object-cover"
          />
          <Button variant="ghost" size="sm" onClick={clear} disabled={disabled}>
            <X className="mr-1 h-4 w-4" aria-hidden />
            Quitar
          </Button>
        </div>
      ) : (
        <div className="mt-1.5">
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="min-h-11 w-full sm:w-auto"
          >
            <Camera className="mr-2 h-5 w-5" aria-hidden />
            Tomar foto
          </Button>
          {required ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              La foto es obligatoria para registrar la merma.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
