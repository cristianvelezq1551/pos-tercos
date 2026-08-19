'use client';

import { X } from 'lucide-react';
import { ProductImage } from '../ProductImage';

/** Cabecera del picker: foto del producto (o inicial) + botón cerrar. */
export function PickerHeader({
  name,
  imageUrl,
  onClose,
}: {
  name: string;
  imageUrl: string | null;
  onClose: () => void;
}) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
      {/* El picker es más grande que las tarjetas → pedile a next/image un
          candidato mayor del srcset. */}
      <ProductImage src={imageUrl} alt={name} sizes="(max-width: 640px) 90vw, 480px" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80"
      >
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
