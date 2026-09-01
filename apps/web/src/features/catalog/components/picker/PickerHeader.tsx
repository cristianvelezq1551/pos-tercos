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
    // La foto se topa en alto: a 4:3 sobre el ancho del teléfono ocupaba tres
    // cuartos de la pantalla y empujaba el botón de agregar fuera de la vista.
    <div className="relative aspect-[4/3] max-h-[34dvh] w-full shrink-0 overflow-hidden bg-muted">
      {/* El picker es más grande que las tarjetas → pedile a next/image un
          candidato mayor del srcset. */}
      <ProductImage src={imageUrl} alt={name} sizes="(max-width: 640px) 90vw, 480px" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/90"
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
