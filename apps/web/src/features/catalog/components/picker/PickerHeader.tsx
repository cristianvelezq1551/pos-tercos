'use client';

import { X } from 'lucide-react';

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
    <div className="relative aspect-[520/280] w-full overflow-hidden bg-muted sm:aspect-[520/240]">
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-background">
          <span className="font-display text-8xl font-extrabold uppercase tracking-[0.04em] text-white/10">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
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
