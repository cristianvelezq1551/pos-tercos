'use client';

import { MAX_PROOFS_POR_PAGO } from '@pos-tercos/types';
import { FormField, Input } from '@pos-tercos/ui';
import { FileImage, X } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';

/**
 * Selector de comprobantes para los diálogos de "marcar pagado". Acepta VARIAS
 * imágenes: una transferencia se parte en dos, o el soporte del banco va aparte
 * de la foto del recibo, y con un solo archivo la segunda se perdía.
 */
export function ProofFilesField({
  files,
  onChange,
  disabled,
  required = false,
  label = 'Comprobante',
  max = MAX_PROOFS_POR_PAGO,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  /** Cuántas caben acá. Baja del tope cuando el pago ya suma otra imagen
   *  aparte (ej. la foto de la factura marcada como comprobante). */
  max?: number;
}) {
  const [previews, setPreviews] = useState<string[]>([]);

  // Las URL de objeto se revocan al cambiar la lista: si no, cada re-selección
  // deja el blob anterior vivo en memoria.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const lleno = files.length >= max;

  const agregar = (e: ChangeEvent<HTMLInputElement>): void => {
    const elegidos = Array.from(e.target.files ?? []);
    if (elegidos.length > 0) {
      onChange([...files, ...elegidos].slice(0, max));
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <FormField
        label={files.length > 1 ? `${label} (${files.length})` : label}
        required={required}
        hint={
          lleno
            ? `Llegaste al máximo de ${max}.`
            : 'JPEG, PNG o WebP. Puedes elegir varias a la vez.'
        }
      >
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={agregar}
          disabled={disabled || lleno}
        />
      </FormField>

      {files.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">
          <FileImage className="h-4 w-4" /> Sin imagen seleccionada
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {previews.map((url, i) => (
            <li key={url} className="relative">
              <img
                src={url}
                alt={`Comprobante ${i + 1}`}
                className="h-24 w-full rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, n) => n !== i))}
                aria-label={`Quitar la imagen ${i + 1}`}
                className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
