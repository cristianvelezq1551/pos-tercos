'use client';

import { Button, Label } from '@pos-tercos/ui';
import { useRef, useState } from 'react';
import { uploadProductImage } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface ProductFormImageFieldProps {
  imageUrl: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

export function ProductFormImageField({ imageUrl, onChange, disabled }: ProductFormImageFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadProductImage(file);
      onChange(result.imageUrl);
    } catch (e) {
      setError(getErrorMessage(e, 'Error al subir imagen.'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label>Imagen del producto</Label>
      {imageUrl ? (
        <div className="flex items-start gap-3">
          <img
            src={imageUrl}
            alt="Imagen actual"
            className="h-24 w-24 rounded-md border border-border object-cover"
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? 'Subiendo…' : 'Reemplazar'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || uploading}
              onClick={() => onChange('')}
            >
              Quitar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Subiendo…' : 'Subir imagen'}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Formatos: PNG, JPG, WebP, GIF, BMP, TIFF, HEIC, AVIF. Máx 5 MB.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
